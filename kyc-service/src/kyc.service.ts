import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { DATABASE } from './database';
import { CreateCaseDto, ReviewCaseDto } from './kyc.dto';
import { KycStorageService } from './kyc-storage.service';

@Injectable()
export class KycService {
  constructor(
    @Inject(DATABASE) private readonly db: Pool,
    private readonly storage: KycStorageService,
  ) {}

  async list(query: Record<string, string>) {
    const page = this.integer(query.page, 1, 1, 1_000_000);
    const limit = this.integer(query.limit, 25, 1, 100);
    const values: unknown[] = [];
    const where: string[] = [];
    if (query.status) {
      values.push(query.status.toUpperCase());
      where.push(`cases.status=$${values.length}`);
    }
    if (query.customerMsisdn) {
      if (!/^\d{7,15}$/.test(query.customerMsisdn)) throw new BadRequestException('Invalid MSISDN');
      values.push(query.customerMsisdn);
      where.push(`cases.customer_msisdn=$${values.length}::bigint`);
    }
    values.push(limit, (page - 1) * limit);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await this.db.query(
      `SELECT cases.id,cases.customer_msisdn::text AS "customerMsisdn",
              cases.document_type AS "documentType",cases.issuing_country AS "issuingCountry",
              cases.status,cases.system_recommendation AS "systemRecommendation",
              cases.face_match_score::numeric AS "faceMatchScore",cases.aml_match AS "amlMatch",
              cases.assigned_reviewer AS "assignedReviewer",
              cases.created_by AS "createdBy",
              cases.created_at AS "createdAt",cases.updated_at AS "updatedAt",
              count(*) OVER()::int AS "totalRecords"
       FROM kyc.cases cases ${clause}
       ORDER BY cases.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { data: rows, totalRecords: Number(rows[0]?.totalRecords || 0), page, limit };
  }

  async get(id: string) {
    this.uuid(id);
    const { rows } = await this.db.query(
      `SELECT cases.id,cases.customer_msisdn::text AS "customerMsisdn",
              cases.document_type AS "documentType",cases.issuing_country AS "issuingCountry",
              cases.status,cases.system_recommendation AS "systemRecommendation",
              cases.face_match_score::numeric AS "faceMatchScore",cases.aml_match AS "amlMatch",
              cases.extracted_data AS "extractedData",cases.screening_summary AS "screeningSummary",
              cases.assigned_reviewer AS "assignedReviewer",cases.final_reason AS "finalReason",
              cases.created_by AS "createdBy",cases.reviewed_by AS "reviewedBy",
              cases.created_at AS "createdAt",cases.updated_at AS "updatedAt",
              cases.reviewed_at AS "reviewedAt"
       FROM kyc.cases cases WHERE cases.id=$1::uuid`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('KYC case not found');
    const [documents, audit] = await Promise.all([
      this.db.query(
        `SELECT id,document_role AS role,original_name AS "originalName",
                content_type AS "contentType",size_bytes::text AS "sizeBytes",created_at AS "createdAt"
         FROM kyc.documents WHERE case_id=$1::uuid AND deleted_at IS NULL ORDER BY created_at`,
        [id],
      ),
      this.db.query(
        `SELECT action,previous_status AS "previousStatus",new_status AS "newStatus",
                reason,actor_id AS actor,created_at AS "createdAt"
         FROM kyc.review_audit WHERE case_id=$1::uuid ORDER BY created_at DESC`,
        [id],
      ),
    ]);
    return { ...rows[0], documents: documents.rows, audit: audit.rows };
  }

  async create(input: CreateCaseDto, actor: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const customer = await client.query(
        `SELECT "MSISDN" FROM public."SW_TBL_PROFILE_CUST" WHERE "MSISDN"=$1::bigint`,
        [input.customerMsisdn],
      );
      if (!customer.rows[0]) throw new NotFoundException('Customer profile not found');
      const result = await client.query(
        `INSERT INTO kyc.cases(
           customer_msisdn,document_type,issuing_country,idempotency_key,created_by
         ) VALUES($1::bigint,$2,$3,$4,$5)
         ON CONFLICT(idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [input.customerMsisdn, input.documentType, input.issuingCountry, input.idempotencyKey || null, actor],
      );
      if (!result.rows[0]) throw new ConflictException('This KYC request already exists');
      await this.audit(client, result.rows[0].id, 'CREATE', null, 'DRAFT', 'KYC case created', actor);
      await client.query('COMMIT');
      return this.get(result.rows[0].id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async upload(id: string, role: string, file: Express.Multer.File, actor: string) {
    this.uuid(id);
    const current = await this.get(id);
    if (!['DRAFT', 'RESUBMISSION_REQUIRED'].includes(current.status)) {
      throw new ConflictException('Documents can only be added to draft or resubmission cases');
    }
    const stored = await this.storage.upload(id, role, file);
    try {
      const { rows } = await this.db.query(
        `INSERT INTO kyc.documents(
           case_id,document_role,bucket,object_key,original_name,content_type,size_bytes,sha256,created_by
         ) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id,document_role AS role,original_name AS "originalName",created_at AS "createdAt"`,
        [id, role, stored.bucket, stored.key, file.originalname, stored.contentType, file.size, stored.sha256, actor],
      );
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('This document was already uploaded');
      throw error;
    }
  }

  async documentUrl(id: string, documentId: string) {
    this.uuid(id);
    this.uuid(documentId);
    const { rows } = await this.db.query(
      `SELECT object_key FROM kyc.documents
       WHERE id=$1::uuid AND case_id=$2::uuid AND deleted_at IS NULL`,
      [documentId, id],
    );
    if (!rows[0]) throw new NotFoundException('KYC document not found');
    return { url: await this.storage.presigned(rows[0].object_key), expiresInSeconds: 300 };
  }

  async review(id: string, input: ReviewCaseDto, actor: string) {
    this.uuid(id);
    const status = {
      APPROVE: 'APPROVED',
      REJECT: 'REJECTED',
      REQUEST_RESUBMISSION: 'RESUBMISSION_REQUIRED',
    }[input.action];
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT status,created_by,customer_msisdn,document_type,extracted_data
         FROM kyc.cases WHERE id=$1::uuid FOR UPDATE`,
        [id],
      );
      if (!locked.rows[0]) throw new NotFoundException('KYC case not found');
      if (!['SUBMITTED', 'MANUAL_REVIEW'].includes(locked.rows[0].status)) {
        throw new ConflictException('KYC case is not awaiting review');
      }
      if (input.action === 'APPROVE') {
        const screening = await client.query(
          `SELECT screening_summary->>'status' AS status
           FROM kyc.cases WHERE id=$1::uuid`,
          [id],
        );
        if (screening.rows[0]?.status !== 'CLEAR') {
          throw new ConflictException(
            'KYC approval requires a completed, clear sanctions screening',
          );
        }
      }
      if (locked.rows[0].created_by === actor) {
        throw new ConflictException('The case creator cannot make the final review decision');
      }
      await client.query(
        `UPDATE kyc.cases SET status=$2,final_reason=$3,reviewed_by=$4,
                reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1::uuid`,
        [id, status, input.reason.trim(), actor],
      );
      const approved = await client.query(
        `SELECT id FROM kyc.cases
         WHERE customer_msisdn=$1::bigint AND status='APPROVED'
         ORDER BY reviewed_at DESC NULLS LAST,created_at DESC LIMIT 1`,
        [locked.rows[0].customer_msisdn],
      );
      const approvedCaseId = approved.rows[0]?.id || null;
      const profileStatus = approvedCaseId ? 1 : input.action === 'REJECT' ? 2 : 0;
      const verified = this.verifiedProfileFields(
        locked.rows[0].extracted_data,
        locked.rows[0].document_type,
      );
      const previousProfile = await client.query(
        `SELECT "First_Name" AS "firstName","Last_Name" AS "lastName",
                "ID_Type" AS "idType","ID_Number" AS "idNumber",
                "Gender" AS gender,"DOB"::text AS dob,"Address" AS address,
                "KYC_Status" AS "kycStatus","KYC_Case_ID" AS "kycCaseId",
                "KYC_Verified_Date" AS "kycVerifiedAt","KYC_Verified_By" AS "kycVerifiedBy"
         FROM public."SW_TBL_PROFILE_CUST" WHERE "MSISDN"=$1::bigint FOR UPDATE`,
        [locked.rows[0].customer_msisdn],
      );
      const profile = await client.query(
        `UPDATE public."SW_TBL_PROFILE_CUST"
         SET "KYC_Status"=$2,
             "First_Name"=CASE WHEN $4::boolean THEN COALESCE($5,"First_Name") ELSE "First_Name" END,
             "Last_Name"=CASE WHEN $4::boolean THEN COALESCE($6,"Last_Name") ELSE "Last_Name" END,
             "ID_Type"=CASE WHEN $4::boolean THEN COALESCE($7,"ID_Type") ELSE "ID_Type" END,
             "ID_Number"=CASE WHEN $4::boolean THEN COALESCE($8,"ID_Number") ELSE "ID_Number" END,
             "Gender"=CASE WHEN $4::boolean THEN COALESCE($9,"Gender") ELSE "Gender" END,
             "DOB"=CASE WHEN $4::boolean THEN COALESCE($10::date,"DOB") ELSE "DOB" END,
             "Address"=CASE WHEN $4::boolean THEN COALESCE($11,"Address") ELSE "Address" END,
             "KYC_Case_ID"=CASE WHEN $4::boolean THEN $12::uuid ELSE "KYC_Case_ID" END,
             "KYC_Verified_Date"=CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE "KYC_Verified_Date" END,
             "KYC_Verified_By"=CASE WHEN $4::boolean THEN $3 ELSE "KYC_Verified_By" END,
             "Modified_By"=$3,"Modified_Date"=CURRENT_TIMESTAMP
         WHERE "MSISDN"=$1::bigint
         RETURNING "First_Name" AS "firstName","Last_Name" AS "lastName",
                   "ID_Type" AS "idType","ID_Number" AS "idNumber",
                   "Gender" AS gender,"DOB"::text AS dob,"Address" AS address,
                   "KYC_Status" AS "kycStatus","KYC_Case_ID" AS "kycCaseId",
                   "KYC_Verified_Date" AS "kycVerifiedAt","KYC_Verified_By" AS "kycVerifiedBy"`,
        [locked.rows[0].customer_msisdn, profileStatus, actor,
          input.action === 'APPROVE', verified.firstName || null, verified.lastName || null,
          locked.rows[0].document_type || null, verified.idNumber || null,
          verified.gender || null, verified.dateOfBirth || null, verified.address || null, id],
      );
      if (profile.rows[0]) {
        await client.query(
          `INSERT INTO public.customer_profile_operation_audit(
             customer_msisdn,operation,previous_state,new_state,reason,actor_id)
           VALUES($1::bigint,'KYC_UPDATE',$2::jsonb,$3::jsonb,$4,$5)`,
          [
            locked.rows[0].customer_msisdn,
            JSON.stringify(previousProfile.rows[0] || null),
            JSON.stringify(profile.rows[0]),
            `KYC case ${status.toLowerCase()}: ${input.reason.trim()}`,
            actor,
          ],
        );
      }
      await client.query(
        `UPDATE public.customer_account_opening_requests
         SET status=$2,kyc_case_id=$3::uuid,updated_at=CURRENT_TIMESTAMP
         WHERE customer_msisdn=$1::bigint AND status<>'OPENED'`,
        [
          locked.rows[0].customer_msisdn,
          approvedCaseId ? 'READY_TO_OPEN'
            : input.action === 'REJECT' ? 'KYC_REJECTED' : 'PENDING_KYC',
          approvedCaseId || id,
        ],
      );
      await this.audit(client, id, input.action, locked.rows[0].status, status, input.reason.trim(), actor);
      await client.query('SELECT onboarding.propagate_kyc_decision($1::uuid,$2)', [id, actor]);
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async verify(id: string, actor: string) {
    this.uuid(id);
    const client = await this.db.connect();
    let attemptId = '';
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT status,document_type,issuing_country
         FROM kyc.cases WHERE id=$1::uuid FOR UPDATE`,
        [id],
      );
      if (!current.rows[0]) throw new NotFoundException('KYC case not found');
      if (!['DRAFT', 'RESUBMISSION_REQUIRED'].includes(current.rows[0].status)) {
        throw new ConflictException('KYC case cannot be submitted in its current state');
      }
      const documents = await client.query(
        `SELECT document_role,object_key FROM kyc.documents
         WHERE case_id=$1::uuid AND deleted_at IS NULL`,
        [id],
      );
      const byRole = new Map(documents.rows.map((row) => [row.document_role, row.object_key]));
      const frontRole = current.rows[0].document_type === 'PASSPORT' ? 'PASSPORT' : 'ID_FRONT';
      if (!byRole.has(frontRole) || !byRole.has('SELFIE')) {
        throw new BadRequestException(`${frontRole} and SELFIE documents are required`);
      }
      const number = await client.query(
        `SELECT COALESCE(max(attempt_number),0)+1 AS number
         FROM kyc.verification_attempts WHERE case_id=$1::uuid`,
        [id],
      );
      const attempt = await client.query(
        `INSERT INTO kyc.verification_attempts(case_id,attempt_number,status)
         VALUES($1::uuid,$2,'PROCESSING') RETURNING id`,
        [id, number.rows[0].number],
      );
      attemptId = attempt.rows[0].id;
      await client.query(
        `UPDATE kyc.cases SET status='PROCESSING',updated_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
        [id],
      );
      await this.audit(client, id, 'SUBMIT', current.rows[0].status, 'PROCESSING', 'Submitted for OCR and biometric verification', actor);
      await client.query('COMMIT');

      const payload = {
        document_type: current.rows[0].document_type,
        issuing_country: current.rows[0].issuing_country,
        front_url: await this.storage.presigned(byRole.get(frontRole)),
        selfie_url: await this.storage.presigned(byRole.get('SELFIE')),
        back_url: byRole.has('ID_BACK') ? await this.storage.presigned(byRole.get('ID_BACK')) : undefined,
      };
      const base = (process.env.KYC_OCR_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
      const response = await fetch(`${base}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Number(process.env.KYC_OCR_TIMEOUT_MS || 90000)),
      });
      if (!response.ok) throw new Error(`OCR returned HTTP ${response.status}`);
      const result: any = await response.json();
      const score = Number(result?.face?.score || 0);
      const recommendation = score >= 60 ? 'APPROVED' : score >= 40 ? 'MANUAL_REVIEW' : 'REJECTED';
      const screening = await this.screenName(result?.document?.fullName);
      const finalRecommendation = screening.status === 'CLEAR'
        ? recommendation
        : 'MANUAL_REVIEW';
      await client.query('BEGIN');
      await client.query(
        `UPDATE kyc.verification_attempts
         SET status='COMPLETED',ocr_result=$2::jsonb,face_result=$3::jsonb,
             screening_result=$4::jsonb,model_version=$5,
             completed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
        [
          attemptId,
          JSON.stringify(result.document || {}),
          JSON.stringify(result.face || {}),
          JSON.stringify(screening),
          result.modelVersion || null,
        ],
      );
      await client.query(
        `UPDATE kyc.cases
         SET status='MANUAL_REVIEW',system_recommendation=$2,face_match_score=$3,
             extracted_data=$4::jsonb,screening_summary=$5::jsonb,
             aml_match=$6,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1::uuid`,
        [
          id,
          finalRecommendation,
          score,
          JSON.stringify(result.document || {}),
          JSON.stringify(screening),
          screening.status === 'MATCH',
        ],
      );
      await this.audit(
        client,
        id,
        'SYSTEM_RESULT',
        'PROCESSING',
        'MANUAL_REVIEW',
        `Biometric recommendation ${finalRecommendation}; screening ${screening.status}`,
        'KYC_SYSTEM',
      );
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (attemptId) {
        await this.db.query(
          `UPDATE kyc.verification_attempts SET status='FAILED',error_code='OCR_FAILURE',
                  error_message=$2,completed_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
          [attemptId, error instanceof Error ? error.message.slice(0, 1000) : 'Unknown OCR failure'],
        );
        await this.db.query(
          `UPDATE kyc.cases SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
          [id],
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private audit(client: PoolClient, caseId: string, action: string, previous: string | null, next: string, reason: string, actor: string) {
    return client.query(
      `INSERT INTO kyc.review_audit(case_id,action,previous_status,new_status,reason,actor_id)
       VALUES($1::uuid,$2,$3,$4,$5,$6)`,
      [caseId, action, previous, next, reason, actor],
    );
  }

  private verifiedProfileFields(extracted: unknown, documentType: unknown) {
    const data = extracted && typeof extracted === 'object'
      ? extracted as Record<string, unknown>
      : {};
    const text = (value: unknown, max: number) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim();
      return normalized ? normalized.slice(0, max) : undefined;
    };
    const genderValue = String(data.gender || '').trim().toUpperCase();
    const gender = genderValue === 'M' || genderValue === 'MALE'
      ? 'M'
      : genderValue === 'F' || genderValue === 'FEMALE' ? 'F' : undefined;
    const dateValue = String(data.dateOfBirth || data.dob || '').trim();
    const dateOfBirth = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(dateValue)
      ? dateValue
      : undefined;
    return {
      firstName: text(data.firstName || data.givenNames, 100),
      lastName: text(data.lastName || data.surname, 100),
      idNumber: text(data.idNumber || data.documentNumber, 100),
      gender,
      dateOfBirth,
      address: text(data.address, 500),
      documentType: text(documentType, 40),
    };
  }

  private async screenName(name: unknown) {
    const normalized = String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) {
      return {
        status: 'UNAVAILABLE',
        reason: 'OCR did not extract a screenable full name',
      };
    }
    const count = await this.db.query(
      `SELECT count(*)::int AS count FROM kyc.sanction_records`,
    );
    if (!Number(count.rows[0]?.count || 0)) {
      return { status: 'UNAVAILABLE', reason: 'Sanctions dataset is empty' };
    }
    const { rows } = await this.db.query(
      `SELECT source,original_name AS "originalName",
              source_record_id AS "sourceRecordId",
              similarity(normalized_name,$1)::numeric AS score
       FROM kyc.sanction_records
       WHERE normalized_name % $1 OR similarity(normalized_name,$1)>=0.6
       ORDER BY similarity(normalized_name,$1) DESC LIMIT 1`,
      [normalized],
    );
    if (!rows[0] || Number(rows[0].score) < 0.6) {
      return { status: 'CLEAR', screenedName: normalized };
    }
    return {
      status: 'MATCH',
      screenedName: normalized,
      source: rows[0].source,
      originalName: rows[0].originalName,
      sourceRecordId: rows[0].sourceRecordId,
      score: Number(rows[0].score),
    };
  }

  private integer(value: string | undefined, fallback: number, min: number, max: number) {
    const parsed = value ? Number(value) : fallback;
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`Value must be between ${min} and ${max}`);
    }
    return parsed;
  }

  private uuid(value: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException('Invalid KYC identifier');
    }
  }
}
