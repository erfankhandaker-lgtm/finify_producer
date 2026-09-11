import { BadRequestException, ConflictException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JourneyGraphInput } from './onboarding.types';

describe('OnboardingService graph validation',() => {
  const service=new OnboardingService({} as any,{} as any);
  const graph: JourneyGraphInput={
    scopes:[{ countryCode:'UGA',channelCode:'MOBILE_APP',customerType:'INDIVIDUAL',priority:100 }],
    nodes:[
      { key:'start',type:'START',name:'Start',configuration:{},position:{ x:0,y:0 },entry:true },
      { key:'phone',type:'PHONE_CAPTURE',name:'Phone',configuration:{},position:{ x:200,y:0 } },
      { key:'otp',type:'OTP_VERIFICATION',name:'OTP',configuration:{},position:{ x:400,y:0 } },
      { key:'kyc',type:'KYC',name:'KYC',configuration:{ kycConfigurationVersionId:'kyc-version' },position:{ x:600,y:0 } },
      { key:'wallet',type:'WALLET_ALLOCATION',name:'Wallet',configuration:{ walletProductBindingId:'wallet-binding',walletType:103,currency:'UGX' },position:{ x:800,y:0 } },
      { key:'score',type:'CREDIT_SCORE',name:'Score',configuration:{ providerCode:'PRIMARY_SCORE' },position:{ x:1000,y:0 } },
      { key:'policy',type:'CREDIT_POLICY',name:'Policy',configuration:{ policyCode:'UG_CONSUMER',policyVersion:1 },position:{ x:1200,y:0 } },
      { key:'end',type:'END',name:'Complete',configuration:{},position:{ x:1400,y:0 } },
    ],
    transitions:[
      ['start','phone'],['phone','otp'],['otp','kyc'],['kyc','wallet'],
      ['wallet','score'],['score','policy'],['policy','end'],
    ].map(([from,to],index) => ({ from,to,outcome:'SUCCESS',priority:index+1 })),
  };

  it('accepts a connected configured onboarding graph',() => {
    expect(service.validateGraph(graph)).toEqual({ valid:true,issues:[] });
  });

  it('reports missing action configuration and unreachable nodes',() => {
    const invalid: JourneyGraphInput=JSON.parse(JSON.stringify(graph));
    invalid.nodes.find((node) => node.key==='wallet')!.configuration={};
    invalid.nodes.push({ key:'orphan',type:'END',name:'Orphan',configuration:{},position:{ x:0,y:200 } });
    const result=service.validateGraph(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code:'MISSING_NODE_CONFIGURATION',nodeKey:'wallet' }),
      expect.objectContaining({ code:'UNREACHABLE_NODE',nodeKey:'orphan' }),
    ]));
  });

  it('rejects multiple entry nodes and outgoing END transitions',() => {
    const invalid: JourneyGraphInput=JSON.parse(JSON.stringify(graph));
    invalid.nodes[1].entry=true;
    invalid.transitions.push({ from:'end',to:'phone',outcome:'RETRY',priority:100 });
    const codes=service.validateGraph(invalid).issues.map((issue) => issue.code);
    expect(codes).toContain('ENTRY_NODE_COUNT');
    expect(codes).toContain('END_HAS_TRANSITION');
  });
});

describe('OnboardingService runtime progression',() => {
  const runtimeResult={
    instance_id:'11111111-1111-4111-8111-111111111111',
    customer_id:'22222222-2222-4222-8222-222222222222',
    status:'IN_PROGRESS',
    current_node_id:'33333333-3333-4333-8333-333333333333',
    current_node_key:'otp',
    current_node_type:'OTP_VERIFICATION',
    current_node_name:'Verify phone',
    current_node_configuration:{},
    completed_at:null,
    replayed:false,
  };

  it('passes only token and input hashes to the atomic database function',async() => {
    const query=jest.fn()
      .mockResolvedValueOnce([{ node_type:'PHONE_CAPTURE' }])
      .mockResolvedValueOnce([runtimeResult]);
    const service=new OnboardingService({ query } as any,{} as any);
    const response=await service.advanceStep(
      runtimeResult.instance_id,
      { nodeKey:'phone',outcome:'SUCCESS',output:{ captured:true } },
      'resume-token-value-with-enough-length',
      'runtime-test-0001',
      'correlation-1',
    );

    expect(query).toHaveBeenCalledTimes(2);
    const parameters=query.mock.calls[1][1];
    expect(parameters[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(parameters[1]).not.toContain('resume-token-value');
    expect(parameters[5]).toMatch(/^[0-9a-f]{64}$/);
    expect(response).toEqual(expect.objectContaining({
      currentNodeKey:'otp',status:'IN_PROGRESS',replayed:false,
    }));
  });

  it('maps stale-node database errors to a conflict',async() => {
    const query=jest.fn()
      .mockResolvedValueOnce([{ node_type:'PHONE_CAPTURE' }])
      .mockRejectedValueOnce(new Error('Onboarding journey current node changed'));
    const service=new OnboardingService({ query } as any,{} as any);

    await expect(service.advanceStep(
      runtimeResult.instance_id,
      { nodeKey:'phone',outcome:'SUCCESS' },
      'resume-token-value-with-enough-length',
      'runtime-test-0002',
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects oversized step metadata before querying the database',async() => {
    const query=jest.fn();
    const service=new OnboardingService({ query } as any,{} as any);

    await expect(service.advanceStep(
      runtimeResult.instance_id,
      { nodeKey:'phone',outcome:'SUCCESS',output:{ value:'x'.repeat(17_000) } },
      'resume-token-value-with-enough-length',
      'runtime-test-0003',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('prevents a customer from self-approving a verified service node',async() => {
    const query=jest.fn().mockResolvedValueOnce([{ node_type:'OTP_VERIFICATION' }]);
    const service=new OnboardingService({ query } as any,{} as any);

    await expect(service.advanceStep(
      runtimeResult.instance_id,
      { nodeKey:'otp',outcome:'SUCCESS' },
      'resume-token-value-with-enough-length',
      'runtime-test-0004',
    )).rejects.toThrow('OTP_VERIFICATION requires its dedicated verified onboarding service');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
