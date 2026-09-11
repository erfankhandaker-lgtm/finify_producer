import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ListQueryDto, ManualReviewDecisionDto, ManualReviewRecommendationDto } from './credit-rule.dto';

@Injectable()
export class CreditManualReviewService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: ListQueryDto) {
    const offset=(query.page-1)*query.limit;
    const params: unknown[]=[`%${query.search ?? ''}%`,query.limit,offset];
    const status=query.status ? 'AND review.status=$4' : '';
    if (query.status) params.push(query.status.toUpperCase());
    const items=await this.dataSource.query(
      `SELECT review.id::text,review.status,review.assigned_to AS "assignedTo",
              review.recommendation,review.recommended_by AS "recommendedBy",review.recommended_at AS "recommendedAt",
              review.decided_by AS "decidedBy",review.decided_at AS "decidedAt",review.created_at AS "createdAt",
              queue.code AS "queueCode",queue.name AS "queueName",queue.sla_minutes AS "slaMinutes",
              execution.id::text AS "executionId",execution.customer_id AS "customerId",
              execution.application_id AS "applicationId",execution.product_id AS "productId",
              execution.customer_category AS "grade",execution.allocated_limit::numeric AS "allocatedLimit",
              execution.reason_codes AS "reasonCodes"
       FROM public.credit_manual_review_cases review
       JOIN public.credit_manual_review_queues queue ON queue.id=review.queue_id
       JOIN public.credit_rule_executions execution ON execution.id=review.execution_id
       WHERE (execution.customer_id ILIKE $1 OR COALESCE(execution.application_id,'') ILIKE $1) ${status}
       ORDER BY review.created_at LIMIT $2 OFFSET $3`,params);
    return {items,page:query.page,limit:query.limit};
  }

  async get(id:string) {
    const rows=await this.dataSource.query(
      `SELECT review.*,review.id::text,review.execution_id::text,review.queue_id::text,
              execution.customer_id,execution.application_id,execution.product_id,execution.currency,
              execution.customer_category,execution.allocated_limit,execution.available_limit,
              execution.decision_inputs,execution.reason_codes,queue.code AS queue_code,queue.required_approvals
       FROM public.credit_manual_review_cases review
       JOIN public.credit_rule_executions execution ON execution.id=review.execution_id
       JOIN public.credit_manual_review_queues queue ON queue.id=review.queue_id WHERE review.id=$1::uuid`,[id]);
    if (!rows[0]) throw new NotFoundException('Credit manual-review case was not found');
    const actions=await this.dataSource.query(
      `SELECT id::text,action,actor_id AS "actorId",reason_code AS "reasonCode",comment,payload,created_at AS "createdAt"
       FROM public.credit_manual_review_actions WHERE case_id=$1::uuid ORDER BY id`,[id]);
    return {...rows[0],actions};
  }

  async recommend(id:string,dto:ManualReviewRecommendationDto,actor:string) {
    return this.dataSource.transaction(async manager => {
      const rows=await manager.query(`SELECT * FROM public.credit_manual_review_cases WHERE id=$1::uuid FOR UPDATE`,[id]);
      const review=rows[0];
      if (!review) throw new NotFoundException('Credit manual-review case was not found');
      if (!['PENDING','IN_REVIEW'].includes(review.status)) throw new ConflictException('Only an open case can be recommended');
      await this.assertReason(dto.reasonCode,dto.recommendation==='REJECT' ? 'REJECT' : undefined,manager);
      await manager.query(
        `UPDATE public.credit_manual_review_cases SET status='RECOMMENDED',recommendation=$2,
           recommendation_reason_code=$3,recommendation_comment=$4,recommended_limit=$5,recommended_by=$6,
           recommended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
        [id,dto.recommendation,dto.reasonCode,dto.comment,dto.recommendedLimit ?? null,actor]);
      await manager.query(
        `INSERT INTO public.credit_manual_review_actions(case_id,action,actor_id,reason_code,comment,payload)
         VALUES($1::uuid,'RECOMMEND',$2,$3,$4,$5::jsonb)`,
        [id,actor,dto.reasonCode,dto.comment,JSON.stringify({recommendation:dto.recommendation,recommendedLimit:dto.recommendedLimit})]);
      return {id,status:'RECOMMENDED',recommendedBy:actor};
    });
  }

  async decide(id:string,dto:ManualReviewDecisionDto,actor:string) {
    return this.dataSource.transaction(async manager => {
      const rows=await manager.query(
        `SELECT review.*,execution.product_id,execution.currency,execution.decision_inputs,
                execution.allocated_limit,execution.existing_exposure,execution.pending_reservations
         FROM public.credit_manual_review_cases review JOIN public.credit_rule_executions execution ON execution.id=review.execution_id
         WHERE review.id=$1::uuid FOR UPDATE OF review`,[id]);
      const review=rows[0];
      if (!review) throw new NotFoundException('Credit manual-review case was not found');
      if (review.status!=='RECOMMENDED') throw new ConflictException('A recorded recommendation is required before final decision');
      if (review.recommended_by===actor) throw new ConflictException('The final approver must differ from the recommending reviewer');
      await this.assertReason(dto.reasonCode,dto.decision==='REJECTED' ? 'REJECT' : undefined,manager);
      if (dto.decision==='APPROVED') {
        const binding=await manager.query(
          `SELECT binding.id FROM public.credit_product_bindings binding JOIN public.credit_lenders lender ON lender.id=binding.lender_id
           WHERE binding.status='ACTIVE' AND lender.status='ACTIVE' AND binding.product_id=$1 AND binding.currency=$2
             AND binding.country_code=$3 AND (binding.channel IS NULL OR binding.channel=$4) LIMIT 1`,
          [review.product_id,review.currency,review.decision_inputs.countryCode,review.decision_inputs.channel]);
        if (!binding[0]) throw new ConflictException('Cannot approve until an active lender and commercial binding exists');
      }
      const approvedLimit=dto.decision==='APPROVED'
        ? Number(dto.approvedLimit ?? review.recommended_limit ?? review.allocated_limit) : 0;
      if (dto.decision==='APPROVED' && (approvedLimit<=0 || approvedLimit>Number(review.allocated_limit))) {
        throw new BadRequestException('approvedLimit must be positive and cannot exceed the policy-calculated limit');
      }
      const outcome=dto.decision==='APPROVED' ? 'AUTO_APPROVED' : 'REJECTED';
      const available=Math.max(0,approvedLimit-Number(review.existing_exposure)-Number(review.pending_reservations));
      await manager.query(
        `UPDATE public.credit_manual_review_cases SET status=$2,final_reason_code=$3,final_comment=$4,
           approved_limit=$5,decided_by=$6,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1::uuid`,
        [id,dto.decision,dto.reasonCode,dto.comment,approvedLimit,actor]);
      await manager.query(
        `UPDATE public.credit_rule_executions SET outcome=$2,allocated_limit=$3,available_limit=$4,
           reason_codes=(reason_codes || to_jsonb($5::text)) WHERE id=$1::uuid`,
        [review.execution_id,outcome,approvedLimit,available,dto.reasonCode]);
      await manager.query(
        `INSERT INTO public.credit_manual_review_actions(case_id,action,actor_id,reason_code,comment,payload)
         VALUES($1::uuid,$2,$3,$4,$5,$6::jsonb)`,
        [id,dto.decision,actor,dto.reasonCode,dto.comment,JSON.stringify({approvedLimit})]);
      return {id,status:dto.decision,decidedBy:actor,approvedLimit};
    });
  }

  private async assertReason(code:string,decisionType:string|undefined,manager:{query:(sql:string,params?:unknown[])=>Promise<any[]>}) {
    const rows=await manager.query(
      `SELECT code,decision_type FROM public.credit_reason_catalogue WHERE code=upper($1) AND is_active`,[code]);
    if (!rows[0]) throw new BadRequestException('Reason code is not active in the governed catalogue');
    if (decisionType && rows[0].decision_type!==decisionType) throw new BadRequestException(`Reason code must be of type ${decisionType}`);
  }
}
