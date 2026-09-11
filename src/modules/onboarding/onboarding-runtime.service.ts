import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import {
  createDecipheriv,
  createHash,
  createHmac,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { WalletService } from '../wallets/wallet.service';
import {
  AcceptOnboardingConsentDto,
  CreateOnboardingPinDto,
  OnboardingNodeCallbackDto,
  StartOnboardingKycDto,
  SubmitOnboardingProfileDto,
  VerifyOnboardingOtpDto,
  VerifyOnboardingPinDto,
} from './dto/onboarding-runtime.dto';

type RuntimeContext = {
  instanceId: string; customerId: string; tenantId: string; countryCode: string;
  customerType: string; channelCode: string; nodeId: string; nodeKey: string;
  nodeType: string; configuration: Record<string, any>; contactId: string;
  phoneCiphertext: Buffer; status: string;
};

@Injectable()
export class OnboardingRuntimeService {
  constructor(private readonly dataSource: DataSource, private readonly wallets: WalletService) {}

  async createOtpChallenge(instanceId: string, resumeToken: string, idempotencyKey: string) {
    this.assertIdempotency(idempotencyKey);
    const result = await this.dataSource.transaction(async manager => {
      const context = await this.context(manager, instanceId, resumeToken, 'OTP_VERIFICATION', true);
      const policyId = String(context.configuration.otpPolicyId || context.configuration.policyId || '');
      const [policy] = await manager.query(
        `SELECT id,expiry_seconds AS "expirySeconds",maximum_attempts AS "maximumAttempts",
                resend_seconds AS "resendSeconds",maximum_sends_per_hour AS "maximumSendsPerHour"
         FROM onboarding.otp_policies
         WHERE id=$1::uuid AND tenant_id=$2::uuid AND country_code=$3
           AND channel_code=$4 AND status='ACTIVE' AND is_active`,
        [policyId, context.tenantId, context.countryCode, context.channelCode],
      );
      if (!policy) throw new ConflictException('The journey OTP policy is not active for this scope');
      const [replay] = await manager.query(
        `SELECT id,status,expires_at AS "expiresAt",resend_available_at AS "resendAvailableAt",
                provider_reference AS "providerReference"
         FROM onboarding.otp_challenges WHERE instance_id=$1::uuid AND idempotency_key=$2`,
        [instanceId, idempotencyKey],
      );
      if (replay) return { ...replay, replayed: true };
      const [recent] = await manager.query(
        `SELECT count(*)::integer AS sends,max(resend_available_at) AS "resendAvailableAt"
         FROM onboarding.otp_challenges
         WHERE instance_id=$1::uuid AND created_at>CURRENT_TIMESTAMP-interval '1 hour'`, [instanceId],
      );
      if (Number(recent.sends) >= Number(policy.maximumSendsPerHour)) {
        throw new ConflictException('Maximum OTP sends per hour has been reached');
      }
      if (recent.resendAvailableAt && new Date(recent.resendAvailableAt) > new Date()) {
        throw new ConflictException(`OTP resend is available at ${new Date(recent.resendAvailableAt).toISOString()}`);
      }
      await manager.query(
        `UPDATE onboarding.otp_challenges SET status='CANCELLED'
         WHERE instance_id=$1::uuid AND status='PENDING'`, [instanceId],
      );
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const secretHash = this.otpHash(instanceId, code);
      const [created] = await manager.query(
        `INSERT INTO onboarding.otp_challenges(
           instance_id,contact_id,policy_id,secret_hash,status,idempotency_key,
           provider_reference,expires_at,resend_available_at)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4,'PENDING',$5,'LOCAL_ADAPTER',
                CURRENT_TIMESTAMP+($6||' seconds')::interval,
                CURRENT_TIMESTAMP+($7||' seconds')::interval)
         RETURNING id,status,expires_at AS "expiresAt",resend_available_at AS "resendAvailableAt",
                   provider_reference AS "providerReference"`,
        [instanceId, context.contactId, policy.id, secretHash, idempotencyKey,
          policy.expirySeconds, policy.resendSeconds],
      );
      return {
        ...created, replayed: false,
        ...(process.env.NODE_ENV !== 'production' && process.env.ONBOARDING_OTP_DEV_EXPOSE === 'true'
          ? { developmentCode: code } : {}),
      };
    });
    return result;
  }

  async verifyOtp(instanceId: string, resumeToken: string, idempotencyKey: string, input: VerifyOnboardingOtpDto) {
    this.assertIdempotency(idempotencyKey);
    const result = await this.dataSource.transaction(async manager => {
      const context = await this.context(manager, instanceId, resumeToken, 'OTP_VERIFICATION', true);
      const [challenge] = await manager.query(
        `SELECT challenge.*,policy.maximum_attempts
         FROM onboarding.otp_challenges challenge
         JOIN onboarding.otp_policies policy ON policy.id=challenge.policy_id
         WHERE challenge.instance_id=$1::uuid ORDER BY challenge.created_at DESC LIMIT 1 FOR UPDATE`, [instanceId],
      );
      if (!challenge) throw new NotFoundException('No OTP challenge exists for this journey');
      if (challenge.status === 'VERIFIED') {
        return this.advance(manager, context, 'SUCCESS', idempotencyKey, { otpChallengeId: challenge.id });
      }
      if (challenge.status !== 'PENDING') throw new ConflictException(`OTP challenge is ${challenge.status}`);
      if (new Date(challenge.expires_at) <= new Date()) {
        await manager.query(`UPDATE onboarding.otp_challenges SET status='EXPIRED' WHERE id=$1::uuid`, [challenge.id]);
        throw new ConflictException('OTP challenge has expired');
      }
      const supplied = Buffer.from(this.otpHash(instanceId, input.code));
      const expected = Buffer.from(String(challenge.secret_hash));
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        const attempts = Number(challenge.attempt_count) + 1;
        const locked = attempts >= Number(challenge.maximum_attempts);
        await manager.query(
          `UPDATE onboarding.otp_challenges SET attempt_count=$2,status=$3::varchar,
             locked_at=CASE WHEN $3::varchar='LOCKED' THEN CURRENT_TIMESTAMP ELSE locked_at END WHERE id=$1::uuid`,
          [challenge.id, attempts, locked ? 'LOCKED' : 'PENDING'],
        );
        return { verificationError: locked ? 'OTP challenge is locked' : 'OTP code is invalid' };
      }
      await manager.query(
        `UPDATE onboarding.otp_challenges SET status='VERIFIED',verified_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
        [challenge.id],
      );
      await manager.query(
        `UPDATE customer_registry.contacts SET verified_at=COALESCE(verified_at,CURRENT_TIMESTAMP) WHERE id=$1::uuid`,
        [context.contactId],
      );
      return this.advance(manager, context, 'SUCCESS', idempotencyKey, { otpChallengeId: challenge.id });
    });
    if ('verificationError' in result) throw new ForbiddenException(result.verificationError);
    return result;
  }

  async createPin(instanceId: string, resumeToken: string, idempotencyKey: string, input: CreateOnboardingPinDto) {
    this.assertIdempotency(idempotencyKey);
    if (input.pin !== input.confirmPin) throw new BadRequestException('PIN confirmation does not match');
    if (/^(\d)\1+$/.test(input.pin) || '01234567890'.includes(input.pin) || '09876543210'.includes(input.pin)) {
      throw new BadRequestException('PIN is too easy to guess');
    }
    const pinHash = await hash(input.pin, 12);
    return this.dataSource.transaction(async manager => {
      const context = await this.context(manager, instanceId, resumeToken, 'PIN_SETUP', true);
      const maximumAttempts = Math.min(20, Math.max(1, Number(context.configuration.maximumAttempts || 5)));
      await manager.query(
        `INSERT INTO onboarding.customer_credentials(customer_id,pin_hash,maximum_attempts)
         VALUES($1::uuid,$2,$3)
         ON CONFLICT(customer_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,failed_attempts=0,
           maximum_attempts=EXCLUDED.maximum_attempts,locked_until=NULL,updated_at=CURRENT_TIMESTAMP`,
        [context.customerId, pinHash, maximumAttempts],
      );
      return this.advance(manager, context, 'SUCCESS', idempotencyKey, { credential: 'PIN', created: true });
    });
  }

  async verifyPin(instanceId: string, resumeToken: string, input: VerifyOnboardingPinDto) {
    const result = await this.dataSource.transaction(async manager => {
      const context = await this.context(manager, instanceId, resumeToken, undefined, true);
      const [credential] = await manager.query(
        `SELECT * FROM onboarding.customer_credentials WHERE customer_id=$1::uuid FOR UPDATE`, [context.customerId],
      );
      if (!credential) throw new NotFoundException('Customer PIN has not been created');
      if (credential.locked_until && new Date(credential.locked_until) > new Date()) {
        throw new ForbiddenException(`PIN is locked until ${new Date(credential.locked_until).toISOString()}`);
      }
      if (!(await compare(input.pin, credential.pin_hash))) {
        const attempts = Number(credential.failed_attempts) + 1;
        const locked = attempts >= Number(credential.maximum_attempts);
        await manager.query(
          `UPDATE onboarding.customer_credentials SET failed_attempts=$2,
             locked_until=CASE WHEN $3 THEN CURRENT_TIMESTAMP+interval '15 minutes' ELSE NULL END,
             updated_at=CURRENT_TIMESTAMP WHERE customer_id=$1::uuid`,
          [context.customerId, attempts, locked],
        );
        return { verificationError: locked ? 'PIN is locked for 15 minutes' : 'PIN is invalid' };
      }
      await manager.query(
        `UPDATE onboarding.customer_credentials SET failed_attempts=0,locked_until=NULL,
           updated_at=CURRENT_TIMESTAMP WHERE customer_id=$1::uuid`, [context.customerId],
      );
      return { verified: true };
    });
    if ('verificationError' in result) throw new ForbiddenException(result.verificationError);
    return result;
  }

  async acceptConsent(instanceId: string, resumeToken: string, idempotencyKey: string,
    input: AcceptOnboardingConsentDto, ip?: string, userAgent?: string) {
    this.assertIdempotency(idempotencyKey);
    if (!input.accepted) throw new BadRequestException('Affirmative consent is required');
    return this.dataSource.transaction(async manager => {
      const context = await this.context(manager, instanceId, resumeToken, 'CONSENT', true);
      const version = await this.configuration(manager, context, 'consentVersionId', input.consentVersionId, 'CONSENT');
      const [row] = await manager.query(
        `INSERT INTO onboarding.consent_acceptances(
           instance_id,customer_id,consent_version_id,content_hash,accepted,ip_hash,user_agent_hash,idempotency_key)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4,true,$5,$6,$7)
         ON CONFLICT(instance_id,consent_version_id) DO UPDATE SET accepted=true
         RETURNING id,accepted_at AS "acceptedAt"`,
        [instanceId, context.customerId, version.id, version.contentHash,
          ip ? this.sha256(ip) : null, userAgent ? this.sha256(userAgent) : null, idempotencyKey],
      );
      return this.advance(manager, context, 'SUCCESS', idempotencyKey,
        { consentAcceptanceId: row.id, consentVersionId: version.id, contentHash: version.contentHash });
    });
  }

  async submitProfile(instanceId: string, resumeToken: string, idempotencyKey: string,
    input: SubmitOnboardingProfileDto) {
    this.assertIdempotency(idempotencyKey);
    return this.dataSource.transaction(async manager => {
      const context = await this.context(manager, instanceId, resumeToken, 'FORM', true);
      const version = await this.configuration(manager, context, 'formVersionId', input.formVersionId, 'CUSTOMER_FORM');
      this.validateForm(version.configuration, input.response);
      const canonical = this.canonicalJson(input.response);
      const [row] = await manager.query(
        `INSERT INTO onboarding.profile_form_submissions(
           instance_id,customer_id,form_version_id,response,response_hash,idempotency_key)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5,$6)
         ON CONFLICT(instance_id,form_version_id) DO UPDATE SET response=EXCLUDED.response,
           response_hash=EXCLUDED.response_hash,submitted_at=CURRENT_TIMESTAMP
         RETURNING id,submitted_at AS "submittedAt"`,
        [instanceId, context.customerId, version.id, JSON.stringify(input.response), this.sha256(canonical), idempotencyKey],
      );
      return this.advance(manager, context, 'SUCCESS', idempotencyKey,
        { profileSubmissionId: row.id, formVersionId: version.id });
    });
  }

  async startKyc(instanceId: string, resumeToken: string, idempotencyKey: string, input: StartOnboardingKycDto) {
    this.assertIdempotency(idempotencyKey);
    return this.dataSource.transaction(async manager => {
      const context = await this.context(manager, instanceId, resumeToken, 'KYC', true);
      const configuredId = String(context.configuration.kycConfigurationVersionId || '');
      const version = await this.configuration(manager, context, 'kycConfigurationVersionId', configuredId, 'KYC');
      const permitted = (version.configuration.documentTypes || []).map((item: string) =>
        item === 'NATIONAL_ID' ? 'UGANDA_NATIONAL_ID' : item);
      if (!permitted.includes(input.documentType)) throw new BadRequestException('Document type is not allowed by KYC configuration');
      const [existing] = await manager.query(
        `SELECT link.kyc_case_id AS "kycCaseId",cases.status
         FROM onboarding.kyc_links link JOIN kyc.cases cases ON cases.id=link.kyc_case_id
         WHERE link.instance_id=$1::uuid`, [instanceId],
      );
      if (existing) return { ...existing, replayed: true };
      const [created] = await manager.query(
        `INSERT INTO kyc.cases(customer_id,document_type,issuing_country,configuration_version_id,created_by)
         VALUES($1::uuid,$2,$3,$4::uuid,'onboarding-runtime') RETURNING id,status`,
        [context.customerId, input.documentType, input.issuingCountry, version.id],
      );
      await manager.query(
        `INSERT INTO onboarding.kyc_links(instance_id,kyc_case_id) VALUES($1::uuid,$2::uuid)`,
        [instanceId, created.id],
      );
      await manager.query(
        `INSERT INTO kyc.review_audit(case_id,action,previous_status,new_status,reason,actor_id)
         VALUES($1::uuid,'CREATE',NULL,'DRAFT','Created by customer onboarding','onboarding-runtime')`,
        [created.id],
      );
      return { kycCaseId: created.id, status: created.status, replayed: false };
    });
  }

  async getKyc(instanceId: string, resumeToken: string) {
    const context = await this.context(this.dataSource.manager, instanceId, resumeToken, undefined, false);
    const [row] = await this.dataSource.query(
      `SELECT cases.id AS "kycCaseId",cases.status,cases.document_type AS "documentType",
              cases.issuing_country AS "issuingCountry",
              cases.face_match_score AS "faceMatchScore",cases.screening_summary->>'status' AS "sanctionsStatus",
              cases.final_reason AS "rejectionReason",cases.created_at AS "createdAt",cases.updated_at AS "updatedAt"
       FROM onboarding.kyc_links link JOIN kyc.cases cases ON cases.id=link.kyc_case_id
       WHERE link.instance_id=$1::uuid AND cases.customer_id=$2::uuid`, [instanceId, context.customerId],
    );
    if (!row) throw new NotFoundException('KYC case has not been created');
    return row;
  }

  async uploadKycDocument(instanceId: string, resumeToken: string, role: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('KYC document file is required');
    const caseRow = await this.linkedKyc(instanceId, resumeToken);
    const form = new FormData();
    form.set('role', role);
    form.set('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    return this.kycFetch(`/cases/${caseRow.kycCaseId}/documents`, { method: 'POST', body: form });
  }

  async verifyKyc(instanceId: string, resumeToken: string) {
    const row = await this.linkedKyc(instanceId, resumeToken);
    return this.kycFetch(`/cases/${row.kycCaseId}/verify`, { method: 'POST' });
  }

  async allocateWallet(instanceId: string, resumeToken: string, idempotencyKey: string) {
    this.assertIdempotency(idempotencyKey);
    const context = await this.context(this.dataSource.manager, instanceId, resumeToken, 'WALLET_ALLOCATION', false);
    const bindingId = String(context.configuration.walletProductBindingId || '');
    const [binding] = await this.dataSource.query(
      `SELECT * FROM onboarding.wallet_product_bindings
       WHERE id=$1::uuid AND tenant_id=$2::uuid AND status='ACTIVE'
         AND country_code=$3 AND customer_type=$4 AND (channel_code IS NULL OR channel_code=$5)`,
      [bindingId, context.tenantId, context.countryCode, context.customerType, context.channelCode],
    );
    if (!binding) throw new ConflictException('The journey wallet/product binding is not active for this scope');
    const [replay] = await this.dataSource.query(
      `SELECT wallet_reference AS "walletReference",status FROM onboarding.wallet_allocation_requests
       WHERE instance_id=$1::uuid AND idempotency_key=$2`, [instanceId, idempotencyKey],
    );
    if (replay?.status === 'SUCCEEDED') return { ...replay, replayed: true };
    const phone = this.decryptPii(context.phoneCiphertext).replace(/^\+/, '');
    const [profile] = await this.dataSource.query(
      `SELECT response FROM onboarding.profile_form_submissions
       WHERE instance_id=$1::uuid ORDER BY submitted_at DESC LIMIT 1`, [instanceId],
    );
    if (!profile) throw new ConflictException('A completed customer profile is required before wallet allocation');
    await this.dataSource.transaction(async manager => {
      await manager.query(
        `INSERT INTO onboarding.wallet_allocation_requests(
           instance_id,wallet_type,currency,pricing_plan_code,status,idempotency_key)
         VALUES($1::uuid,$2,$3,$4,'PENDING',$5)
         ON CONFLICT(instance_id,idempotency_key) DO NOTHING`,
        [instanceId, binding.wallet_type, binding.currency, binding.pricing_rule_code, idempotencyKey],
      );
      await manager.query(
        `INSERT INTO public."SW_TBL_PROFILE_CUST"(
           "MSISDN","First_Name","Last_Name","Email","Address","KYC_Status","Status",
           "Created_By","Approved_By","Approved_Date")
         VALUES($1::bigint,$2,$3,$4,$5,1,0,'onboarding-runtime','onboarding-runtime',CURRENT_TIMESTAMP)
         ON CONFLICT("MSISDN") DO NOTHING`,
        [phone, String(profile.response.givenName || 'Customer'), String(profile.response.familyName || ''),
          profile.response.email || null, this.profileAddress(profile.response.residentialAddress)],
      );
      await manager.query(
        `UPDATE customer_registry.customers SET legacy_profile_msisdn=$2::bigint,updated_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
        [context.customerId, phone],
      );
      await manager.query(
        `UPDATE kyc.cases SET customer_msisdn=$2::bigint WHERE customer_id=$1::uuid AND status='APPROVED'`,
        [context.customerId, phone],
      );
    });
    try {
      const result = await this.wallets.createCustomer({
        msisdn: phone, firstName: String(profile.response.givenName || 'Customer'),
        lastName: String(profile.response.familyName || ''), email: profile.response.email as string | undefined,
        address: this.profileAddress(profile.response.residentialAddress), defaultCurrency: binding.currency,
        walletCode: Number(binding.wallet_type), issuingCountry: context.countryCode,
      }, 'onboarding-runtime');
      const walletReference = String(result.wallet?.walletId || '');
      await this.dataSource.transaction(async manager => {
        await manager.query(
          `UPDATE onboarding.wallet_allocation_requests SET status='SUCCEEDED',wallet_reference=$3,
             completed_at=CURRENT_TIMESTAMP WHERE instance_id=$1::uuid AND idempotency_key=$2`,
          [instanceId, idempotencyKey, walletReference],
        );
        const fresh = await this.context(manager, instanceId, resumeToken, 'WALLET_ALLOCATION', true);
        await this.advance(manager, fresh, 'SUCCESS', idempotencyKey,
          { walletReference, walletProductBindingId: binding.id });
      });
      return { walletReference, status: 'SUCCEEDED', replayed: false };
    } catch (error) {
      await this.dataSource.query(
        `UPDATE onboarding.wallet_allocation_requests SET status='FAILED',error_code=$3
         WHERE instance_id=$1::uuid AND idempotency_key=$2`,
        [instanceId, idempotencyKey, String((error as any)?.message || 'WALLET_ALLOCATION_FAILED').slice(0, 100)],
      );
      throw error;
    }
  }

  async callback(instanceId: string, callbackKey: string, input: OnboardingNodeCallbackDto) {
    if (!callbackKey || callbackKey !== process.env.ONBOARDING_CALLBACK_KEY) throw new ForbiddenException('Invalid callback credential');
    return this.dataSource.transaction(async manager => {
      const [instance] = await manager.query(
        `SELECT instance.*,node.node_type,node.node_key,node.configuration,
                customer.home_country_code AS "countryCode",customer.customer_type AS "customerType",
                contact.id AS "contactId",contact.value_ciphertext AS "phoneCiphertext"
         FROM onboarding.journey_instances instance JOIN onboarding.journey_nodes node ON node.id=instance.current_node_id
         JOIN customer_registry.customers customer ON customer.id=instance.customer_id
         JOIN customer_registry.contacts contact ON contact.customer_id=customer.id AND contact.contact_type='PHONE' AND contact.is_primary
         WHERE instance.id=$1::uuid FOR UPDATE`, [instanceId],
      );
      if (!instance) throw new NotFoundException('Onboarding journey was not found');
      if (instance.node_type !== input.nodeType) throw new ConflictException('Callback node does not match the journey current node');
      const context = this.mapContext(instance);
      return this.advance(manager, context, input.outcome, input.idempotencyKey,
        { ...input.output, reference: input.reference }, 'EXTERNAL_SERVICE', input.reference);
    });
  }

  private async context(manager: EntityManager, instanceId: string, resumeToken: string,
    expectedNodeType?: string, lock = false): Promise<RuntimeContext> {
    if (!resumeToken || resumeToken.length < 20) throw new BadRequestException('A valid onboarding resume token is required');
    const [row] = await manager.query(
      `SELECT instance.id AS "instanceId",instance.customer_id AS "customerId",instance.tenant_id AS "tenantId",
              instance.status,instance.current_channel_code AS "channelCode",node.id AS "nodeId",node.node_key AS "nodeKey",
              node.node_type AS "nodeType",node.configuration,customer.home_country_code AS "countryCode",
              customer.customer_type AS "customerType",contact.id AS "contactId",contact.value_ciphertext AS "phoneCiphertext"
       FROM onboarding.journey_instances instance JOIN onboarding.journey_nodes node ON node.id=instance.current_node_id
       JOIN customer_registry.customers customer ON customer.id=instance.customer_id
       JOIN customer_registry.contacts contact ON contact.customer_id=customer.id AND contact.contact_type='PHONE' AND contact.is_primary
       WHERE instance.id=$1::uuid AND instance.resume_token_hash=$2 AND instance.expires_at>CURRENT_TIMESTAMP
       ${lock ? 'FOR UPDATE OF instance' : ''}`,
      [instanceId, this.sha256(resumeToken)],
    );
    if (!row) throw new NotFoundException('Onboarding journey was not found or has expired');
    if (!['IN_PROGRESS', 'WAITING_EXTERNAL', 'MANUAL_REVIEW'].includes(row.status)) {
      throw new ConflictException(`Onboarding journey is ${row.status}`);
    }
    if (expectedNodeType && row.nodeType !== expectedNodeType) {
      throw new ConflictException(`Onboarding journey current node is ${row.nodeType}, not ${expectedNodeType}`);
    }
    return row;
  }

  private mapContext(row: any): RuntimeContext {
    return {
      instanceId: row.id, customerId: row.customer_id, tenantId: row.tenant_id,
      countryCode: row.countryCode, customerType: row.customerType,
      channelCode: row.current_channel_code, nodeId: row.current_node_id,
      nodeKey: row.node_key, nodeType: row.node_type, configuration: row.configuration,
      contactId: row.contactId, phoneCiphertext: row.phoneCiphertext, status: row.status,
    };
  }

  private async configuration(manager: EntityManager, context: RuntimeContext, key: string,
    suppliedId: string, type: string) {
    const configuredId = String(context.configuration[key] || '');
    if (!configuredId || configuredId !== suppliedId) throw new ConflictException(`Request does not match journey ${key}`);
    const [version] = await manager.query(
      `SELECT version.id,version.configuration,version.content_hash AS "contentHash"
       FROM onboarding.configuration_versions version
       JOIN onboarding.configuration_definitions definition ON definition.id=version.configuration_definition_id
       WHERE version.id=$1::uuid AND definition.tenant_id=$2::uuid AND definition.configuration_type=$3
         AND version.status='ACTIVE' AND version.country_code=$4 AND version.customer_type=$5
         AND (version.channel_code IS NULL OR version.channel_code=$6)
         AND (version.effective_from IS NULL OR version.effective_from<=CURRENT_TIMESTAMP)
         AND (version.effective_to IS NULL OR version.effective_to>CURRENT_TIMESTAMP)`,
      [suppliedId, context.tenantId, type, context.countryCode, context.customerType, context.channelCode],
    );
    if (!version) throw new ConflictException(`${type} configuration is not active for this journey scope`);
    return version;
  }

  private async advance(manager: EntityManager, context: RuntimeContext, outcome: string,
    idempotencyKey: string, output: Record<string, unknown>, actorType = 'CUSTOMER', actorId = 'customer') {
    const [result] = await manager.query(
      `SELECT * FROM onboarding.advance_verified_step($1::uuid,$2,$3,$4,$5::jsonb,$6,$7,NULL)`,
      [context.instanceId, context.nodeType, outcome, idempotencyKey, JSON.stringify(output), actorType, actorId],
    );
    return {
      instanceId: result.instance_id, customerId: result.customer_id, status: result.status,
      currentNodeId: result.current_node_id, currentNodeKey: result.current_node_key,
      currentNodeType: result.current_node_type, currentNodeName: result.current_node_name,
      currentNodeConfiguration: result.current_node_configuration, completedAt: result.completed_at,
      replayed: result.replayed,
    };
  }

  private validateForm(configuration: Record<string, any>, response: Record<string, unknown>) {
    const fields = Array.isArray(configuration.fields) ? configuration.fields : [];
    for (const field of fields) {
      if (field.required && (response[field.key] === undefined || response[field.key] === null || response[field.key] === '')) {
        throw new BadRequestException(`Profile field ${field.key} is required`);
      }
    }
    if (configuration.additionalProperties === false) {
      const allowed = new Set(fields.map((field: any) => field.key));
      const unknown = Object.keys(response).find(key => !allowed.has(key));
      if (unknown) throw new BadRequestException(`Profile field ${unknown} is not configured`);
    }
  }

  private async linkedKyc(instanceId: string, resumeToken: string) {
    const context = await this.context(this.dataSource.manager, instanceId, resumeToken, 'KYC', false);
    const [row] = await this.dataSource.query(
      `SELECT link.kyc_case_id AS "kycCaseId" FROM onboarding.kyc_links link
       JOIN kyc.cases cases ON cases.id=link.kyc_case_id
       WHERE link.instance_id=$1::uuid AND cases.customer_id=$2::uuid`, [instanceId, context.customerId],
    );
    if (!row) throw new NotFoundException('KYC case has not been created');
    return row;
  }

  private async kycFetch(path: string, init: RequestInit) {
    const base = process.env.KYC_SERVICE_URL || 'http://kyc:5006';
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), 'x-api-key': String(process.env.KYC_ADMIN_API_KEY || ''), 'x-actor-id': 'onboarding-runtime' },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new ConflictException(body?.message || `KYC service returned ${response.status}`);
      return body;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('KYC service is unavailable');
    }
  }

  private otpHash(instanceId: string, code: string) {
    const key = process.env.ONBOARDING_OTP_HMAC_KEY;
    if (!key || key.length < 32) throw new Error('ONBOARDING_OTP_HMAC_KEY must contain at least 32 characters');
    return createHmac('sha256', key).update(`${instanceId}:${code}`).digest('hex');
  }

  private decryptPii(value: Buffer) {
    const key = Buffer.from(String(process.env.ONBOARDING_PII_ENCRYPTION_KEY || ''), 'base64');
    if (key.length !== 32 || !value || value.length < 29) throw new Error('Onboarding PII encryption is not configured');
    const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
  }

  private profileAddress(value: unknown): string | undefined {
    if (!value) return undefined;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  private assertIdempotency(value: string) {
    if (!value || value.length < 8 || value.length > 120) throw new BadRequestException('Idempotency-Key must contain between 8 and 120 characters');
  }

  private sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(item => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`).join(',')}}`;
    return JSON.stringify(value);
  }
}
