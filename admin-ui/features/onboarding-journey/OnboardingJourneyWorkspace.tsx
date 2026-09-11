'use client';

import {
  CheckCircle2,ChevronDown,CopyPlus,GitBranch,GripVertical,LayoutGrid,LoaderCircle,
  Play,Plus,RefreshCw,Save,Send,ShieldCheck,Smartphone,Trash2,UserCheck,
  WalletCards,Workflow,XCircle,
} from 'lucide-react';
import { DragEvent,PointerEvent,useCallback,useEffect,useMemo,useRef,useState } from 'react';
import styles from './OnboardingJourneyWorkspace.module.css';

type RequestInit={ method?:string;body?:unknown;headers?:Record<string,string> };
export type OnboardingAdminRequest=<T>(route:string,init?:RequestInit)=>Promise<T>;

type NodeType='START'|'END'|'PHONE_CAPTURE'|'OTP_VERIFICATION'|'PIN_SETUP'|'CONSENT'|
  'FORM'|'KYC'|'WALLET_ALLOCATION'|'CREDIT_SCORE'|'CREDIT_POLICY'|'LIMIT_ALLOCATION'|
  'DECISION'|'CHANNEL_HANDOFF'|'MANUAL_REVIEW';
type GraphNode={ key:string;type:NodeType;name:string;configuration:Record<string,unknown>;
  position:{ x:number;y:number };entry?:boolean };
type Edge={ from:string;to:string;outcome:string;priority:number;condition?:Record<string,unknown> };
type Scope={ countryCode:string;channelCode:string;customerType:string;priority:number };
type Graph={ scopes:Scope[];nodes:GraphNode[];transitions:Edge[] };
type Version={ id:string;versionNumber:number;status:string;revision:number;updatedAt?:string;graph?:Graph };
type Journey={ id:string;tenantId:string;code:string;name:string;description?:string;versions:Version[] };
type Validation={ valid:boolean;issues:Array<{severity:string;code:string;message:string;nodeKey?:string}> };
type Metadata={
  channels:Array<{code:string;name:string;capabilities?:unknown}>;
  nodeTypes:Array<{code:NodeType;name:string;category:string;sensitive:boolean}>;
  walletTypes:Array<{code:number;name:string;kycRequired:boolean}>;
  currencies:Array<{code:string}>;
  scoreProviders:Array<{code:string;name:string}>;
  creditPolicies:Array<{code:string;name:string}>;
};
type PaletteItem={ type:NodeType;label:string;group:string;defaults:Record<string,unknown> };

const basePalette:PaletteItem[]=[
  {type:'PHONE_CAPTURE',label:'Phone capture',group:'IDENTITY',defaults:{}},
  {type:'OTP_VERIFICATION',label:'OTP verification',group:'SECURITY',defaults:{policyId:'',policyCode:'',policyVersion:1}},
  {type:'PIN_SETUP',label:'PIN setup',group:'SECURITY',defaults:{minimumLength:4,maximumAttempts:5}},
  {type:'CONSENT',label:'Consent',group:'COMPLIANCE',defaults:{consentVersionId:''}},
  {type:'FORM',label:'Questions / form',group:'DATA',defaults:{formVersionId:''}},
  {type:'KYC',label:'FINIFY KYC',group:'COMPLIANCE',defaults:{kycConfigurationVersionId:''}},
  {type:'WALLET_ALLOCATION',label:'Wallet allocation',group:'ACTION',defaults:{walletProductBindingId:'',walletType:103,currency:'UGX',productCode:''}},
  {type:'CREDIT_SCORE',label:'Credit score',group:'CREDIT',defaults:{providerCode:''}},
  {type:'CREDIT_POLICY',label:'Credit policy',group:'CREDIT',defaults:{policyCode:'',policyVersion:1}},
  {type:'LIMIT_ALLOCATION',label:'Limit allocation',group:'CREDIT',defaults:{}},
  {type:'DECISION',label:'Decision branch',group:'CONTROL',defaults:{}},
  {type:'CHANNEL_HANDOFF',label:'Channel handoff',group:'CONTROL',defaults:{targetChannel:''}},
  {type:'MANUAL_REVIEW',label:'Manual review',group:'CONTROL',defaults:{}},
];

const fallbackMetadata:Metadata={
  channels:['MOBILE_APP','WEB','USSD','WHATSAPP','AGENT','API'].map((code)=>({code,name:code.replaceAll('_',' ')})),
  nodeTypes:[],walletTypes:[],currencies:[{code:'UGX'}],scoreProviders:[],creditPolicies:[],
};
const blankGraph=():Graph=>({
  scopes:[{countryCode:'UGA',channelCode:'MOBILE_APP',customerType:'INDIVIDUAL',priority:100}],
  nodes:[
    {key:'start',type:'START',name:'Start',configuration:{},position:{x:60,y:180},entry:true},
    {key:'complete',type:'END',name:'Onboarding complete',configuration:{},position:{x:820,y:180}},
  ],
  transitions:[{from:'start',to:'complete',outcome:'SUCCESS',priority:1}],
});
const statusTone=(status:string)=>status.toLowerCase().replaceAll('_','-');
const nodeIcon=(type:NodeType)=>type==='WALLET_ALLOCATION'?WalletCards:
  type.startsWith('CREDIT')||type==='LIMIT_ALLOCATION'?GitBranch:
    type==='KYC'||type==='CONSENT'||type==='MANUAL_REVIEW'?UserCheck:
      type==='START'||type==='END'?Workflow:Smartphone;
const value=(configuration:Record<string,unknown>,key:string)=>String(configuration[key]??'');

export default function OnboardingJourneyWorkspace({request,profile}:{
  request:OnboardingAdminRequest;profile?:{roles?:string[];permissions?:string[]}
}) {
  const [journeys,setJourneys]=useState<Journey[]>([]);
  const [metadata,setMetadata]=useState<Metadata>(fallbackMetadata);
  const [selectedJourneyId,setSelectedJourneyId]=useState('');
  const [version,setVersion]=useState<Version|null>(null);
  const [graph,setGraph]=useState<Graph>(blankGraph());
  const [selectedNodeKey,setSelectedNodeKey]=useState('start');
  const [configurationDraft,setConfigurationDraft]=useState('{}');
  const [validation,setValidation]=useState<Validation|null>(null);
  const [trace,setTrace]=useState<Array<{nodeKey:string;nodeType:string;outcome?:string}>>([]);
  const [busy,setBusy]=useState('');
  const [dirty,setDirty]=useState(false);
  const [notice,setNotice]=useState<{tone:'success'|'error';text:string}|null>(null);
  const [createOpen,setCreateOpen]=useState(false);
  const [createForm,setCreateForm]=useState({tenantId:'',code:'',name:'',description:''});
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const [simulationOpen,setSimulationOpen]=useState(false);
  const [simulationOutcomes,setSimulationOutcomes]=useState<Record<string,string>>({});
  const [confirmRemove,setConfirmRemove]=useState(false);
  const nextNodeId=useRef(0);
  const dragNode=useRef<{key:string;dx:number;dy:number}|null>(null);

  const selectedJourney=useMemo(()=>journeys.find((item)=>item.id===selectedJourneyId)||null,[journeys,selectedJourneyId]);
  const selectedNode=useMemo(()=>graph.nodes.find((node)=>node.key===selectedNodeKey)||null,[graph.nodes,selectedNodeKey]);
  const editable=Boolean(version&&['DRAFT','REJECTED'].includes(version.status));
  const canCheck=Boolean(profile?.roles?.includes('super_admin')||profile?.permissions?.includes('onboarding_journeys.check'));
  const palette=useMemo(()=>basePalette.map((item)=>{
    const dynamic=metadata.nodeTypes.find((node)=>node.code===item.type);
    return dynamic?{...item,label:dynamic.name,group:dynamic.category}:item;
  }),[metadata.nodeTypes]);
  const branchNodes=useMemo(()=>graph.nodes.filter((node)=>graph.transitions.filter((edge)=>edge.from===node.key).length>1),[graph]);

  const load=useCallback(async()=>{
    setBusy('load');
    try {
      const [journeyData,metadataData]=await Promise.all([
        request<Journey[]>('/api/v1/admin/onboarding/journeys'),
        request<Metadata>('/api/v1/admin/onboarding/metadata'),
      ]);
      setJourneys(journeyData);setMetadata({...fallbackMetadata,...metadataData});setNotice(null);
    } catch(error){setNotice({tone:'error',text:(error as Error).message});}
    finally{setBusy('');}
  },[request]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  useEffect(()=>{
    const timer=window.setTimeout(()=>setConfigurationDraft(selectedNode?JSON.stringify(selectedNode.configuration||{},null,2):'{}'),0);
    return()=>window.clearTimeout(timer);
  },[selectedNode]);

  const changeGraph=(update:Graph|((current:Graph)=>Graph))=>{
    setGraph((current)=>typeof update==='function'?update(current):update);
    setDirty(true);setValidation(null);setTrace([]);
  };
  const openVersion=async(id:string)=>{
    if(dirty&&!window.confirm('Discard unsaved journey changes?')) return;
    setBusy('version');
    try{
      const result=await request<Version>(`/api/v1/admin/onboarding/versions/${id}`);
      setVersion(result);setGraph(result.graph||blankGraph());setSelectedNodeKey(result.graph?.nodes[0]?.key||'');
      setDirty(false);setValidation(null);setTrace([]);setNotice(null);
    }catch(error){setNotice({tone:'error',text:(error as Error).message});}
    finally{setBusy('');}
  };
  const selectJourney=(journey:Journey)=>{
    const preferred=journey.versions.find((item)=>['DRAFT','REJECTED'].includes(item.status))||journey.versions[0];
    if(!preferred)return;
    if(dirty&&!window.confirm('Discard unsaved journey changes?'))return;
    setDirty(false);setSelectedJourneyId(journey.id);void openVersion(preferred.id);
  };
  const createJourney=async()=>{
    setBusy('create');
    try{
      const created=await request<Journey&{version:Version}>('/api/v1/admin/onboarding/journeys',{method:'POST',body:createForm});
      setCreateOpen(false);setCreateForm({tenantId:'',code:'',name:'',description:''});await load();
      setSelectedJourneyId(created.id);await openVersion(created.version.id);
      setNotice({tone:'success',text:'Journey and draft version created.'});
    }catch(error){setNotice({tone:'error',text:(error as Error).message});}
    finally{setBusy('');}
  };
  const createVersion=async()=>{
    if(!selectedJourney||!version||dirty)return;
    setBusy('create-version');
    try{
      const created=await request<Version>(`/api/v1/admin/onboarding/journeys/${selectedJourney.id}/versions`,{
        method:'POST',body:{cloneFromVersionId:version.id,changeSummary:`Created from version ${version.versionNumber}`},
      });
      await load();await openVersion(created.id);setNotice({tone:'success',text:`Version ${created.versionNumber} created from the selected version.`});
    }catch(error){setNotice({tone:'error',text:(error as Error).message});}
    finally{setBusy('');}
  };

  const addNode=(type:NodeType,position?:{x:number;y:number})=>{
    if(!editable)return;
    const meta=palette.find((item)=>item.type===type)!;nextNodeId.current+=1;
    const key=`${type.toLowerCase()}_${Date.now().toString(36)}_${nextNodeId.current}`;
    const node:GraphNode={key,type,name:meta.label,configuration:{...meta.defaults},
      position:position||{x:300+graph.nodes.length*32,y:80+(graph.nodes.length%4)*130}};
    changeGraph((current)=>{
      const end=current.nodes.find((item)=>item.type==='END');
      if(!end)return{...current,nodes:[...current.nodes,node]};
      const incoming=current.transitions.find((edge)=>edge.to===end.key);
      return{...current,nodes:[...current.nodes,node],transitions:incoming?[
        ...current.transitions.filter((edge)=>edge!==incoming),{...incoming,to:key},
        {from:key,to:end.key,outcome:'SUCCESS',priority:incoming.priority+1},
      ]:[...current.transitions,{from:key,to:end.key,outcome:'SUCCESS',priority:100}]};
    });
    setSelectedNodeKey(key);
  };
  const onDrop=(event:DragEvent<HTMLDivElement>)=>{
    event.preventDefault();const type=event.dataTransfer.getData('application/finify-node') as NodeType;
    if(!type)return;const bounds=event.currentTarget.getBoundingClientRect();
    addNode(type,{x:Math.max(12,event.clientX-bounds.left-75),y:Math.max(12,event.clientY-bounds.top-38)});
  };
  const updateNode=(changes:Partial<GraphNode>)=>changeGraph((current)=>({...current,
    nodes:current.nodes.map((node)=>node.key===selectedNodeKey?{...node,...changes}:node),
  }));
  const setConfig=(key:string,newValue:unknown)=>{
    if(!selectedNode)return;updateNode({configuration:{...selectedNode.configuration,[key]:newValue}});
  };
  const applyConfiguration=()=>{
    try{updateNode({configuration:JSON.parse(configurationDraft)});setNotice(null);}
    catch{setNotice({tone:'error',text:'Node configuration must be valid JSON.'});}
  };
  const removeNode=()=>{
    if(!selectedNode||['START','END'].includes(selectedNode.type))return;
    changeGraph((current)=>({...current,nodes:current.nodes.filter((node)=>node.key!==selectedNode.key),
      transitions:current.transitions.filter((edge)=>edge.from!==selectedNode.key&&edge.to!==selectedNode.key)}));
    setSelectedNodeKey('start');setConfirmRemove(false);
  };
  const autoLayout=()=>{
    const order:string[]=[];const queue=[graph.nodes.find((node)=>node.entry)?.key||'start'];const seen=new Set<string>();
    while(queue.length){const key=queue.shift()!;if(seen.has(key))continue;seen.add(key);order.push(key);
      graph.transitions.filter((edge)=>edge.from===key).sort((a,b)=>a.priority-b.priority).forEach((edge)=>queue.push(edge.to));}
    graph.nodes.forEach((node)=>{if(!seen.has(node.key))order.push(node.key);});
    changeGraph((current)=>({...current,nodes:current.nodes.map((node)=>{
      const index=order.indexOf(node.key);return{...node,position:{x:50+(index%5)*220,y:90+Math.floor(index/5)*150}};
    })}));
  };
  const startNodeMove=(event:PointerEvent<HTMLButtonElement>,node:GraphNode)=>{
    if(!editable)return;const bounds=event.currentTarget.parentElement?.getBoundingClientRect();if(!bounds)return;
    event.currentTarget.setPointerCapture(event.pointerId);dragNode.current={key:node.key,dx:event.clientX-bounds.left-node.position.x,dy:event.clientY-bounds.top-node.position.y};
  };
  const moveNode=(event:PointerEvent<HTMLDivElement>)=>{
    if(!dragNode.current)return;const bounds=event.currentTarget.getBoundingClientRect();const {key,dx,dy}=dragNode.current;
    changeGraph((current)=>({...current,nodes:current.nodes.map((node)=>node.key===key?{
      ...node,position:{x:Math.max(8,event.clientX-bounds.left-dx),y:Math.max(8,event.clientY-bounds.top-dy)},
    }:node)}));
  };
  const updateScope=(index:number,changes:Partial<Scope>)=>changeGraph((current)=>({...current,
    scopes:current.scopes.map((scope,scopeIndex)=>scopeIndex===index?{...scope,...changes}:scope),
  }));
  const updateEdge=(index:number,changes:Partial<Edge>)=>changeGraph((current)=>({...current,
    transitions:current.transitions.map((edge,edgeIndex)=>edgeIndex===index?{...edge,...changes}:edge),
  }));

  const save=async()=>{
    if(!version)return;setBusy('save');
    try{
      const result=await request<Version>(`/api/v1/admin/onboarding/versions/${version.id}/graph`,{
        method:'PUT',body:graph,headers:{'If-Match':`"${version.revision}"`},
      });
      setVersion(result);setGraph(result.graph||graph);setDirty(false);setNotice({tone:'success',text:`Draft saved as revision ${result.revision}.`});await load();
    }catch(error){setNotice({tone:'error',text:(error as Error).message});}
    finally{setBusy('');}
  };
  const validate=async()=>{
    if(!version||dirty)return;setBusy('validate');
    try{setValidation(await request<Validation>(`/api/v1/admin/onboarding/versions/${version.id}/validate`,{method:'POST'}));}
    catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}
  };
  const simulate=async()=>{
    if(!version||dirty)return;setBusy('simulate');
    try{
      const result=await request<{validation:Validation;trace:typeof trace}>(`/api/v1/admin/onboarding/versions/${version.id}/simulate`,{method:'POST',body:{outcomes:simulationOutcomes}});
      setValidation(result.validation);setTrace(result.trace);setSimulationOpen(false);
    }catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}
  };
  const transition=async(action:string)=>{
    if(!version||dirty)return;setBusy(action);
    try{
      const result=await request<Version>(`/api/v1/admin/onboarding/versions/${version.id}/${action}`,{method:'POST',body:{}});
      setVersion(result);setGraph(result.graph||graph);await load();setNotice({tone:'success',text:`Journey version ${action} completed.`});
    }catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}
  };

  const configFields=selectedNode&&<>
    {selectedNode.type==='OTP_VERIFICATION'&&<div className={styles.fieldGrid}><label>OTP POLICY VERSION ID<input disabled={!editable} value={value(selectedNode.configuration,'policyId')} onChange={(event)=>setConfig('policyId',event.target.value)}/></label><label>OTP POLICY CODE<input disabled={!editable} value={value(selectedNode.configuration,'policyCode')} onChange={(event)=>setConfig('policyCode',event.target.value)}/></label></div>}
    {selectedNode.type==='PIN_SETUP'&&<div className={styles.fieldGrid}>
      <label>MINIMUM LENGTH<input disabled={!editable} type="number" min={4} max={12} value={value(selectedNode.configuration,'minimumLength')} onChange={(event)=>setConfig('minimumLength',Number(event.target.value))}/></label>
      <label>MAXIMUM ATTEMPTS<input disabled={!editable} type="number" min={1} max={20} value={value(selectedNode.configuration,'maximumAttempts')} onChange={(event)=>setConfig('maximumAttempts',Number(event.target.value))}/></label>
    </div>}
    {selectedNode.type==='CONSENT'&&<label>CONSENT VERSION ID<input disabled={!editable} value={value(selectedNode.configuration,'consentVersionId')} onChange={(event)=>setConfig('consentVersionId',event.target.value)}/></label>}
    {selectedNode.type==='FORM'&&<label>FORM VERSION ID<input disabled={!editable} value={value(selectedNode.configuration,'formVersionId')} onChange={(event)=>setConfig('formVersionId',event.target.value)}/></label>}
    {selectedNode.type==='KYC'&&<label>KYC CONFIGURATION VERSION ID<input disabled={!editable} value={value(selectedNode.configuration,'kycConfigurationVersionId')} onChange={(event)=>setConfig('kycConfigurationVersionId',event.target.value)}/><small className={styles.fieldHint}>References an immutable FINIFY KYC configuration version.</small></label>}
    {selectedNode.type==='WALLET_ALLOCATION'&&<>
      <label>WALLET / PRODUCT BINDING ID<input disabled={!editable} value={value(selectedNode.configuration,'walletProductBindingId')} onChange={(event)=>setConfig('walletProductBindingId',event.target.value)}/></label>
      <label>WALLET TYPE<select disabled={!editable} value={value(selectedNode.configuration,'walletType')} onChange={(event)=>setConfig('walletType',Number(event.target.value))}><option value="">Select wallet type</option>{metadata.walletTypes.map((item)=><option key={item.code} value={item.code}>{item.name} ({item.code}){item.kycRequired?' · KYC':''}</option>)}</select></label>
      <div className={styles.fieldGrid}><label>CURRENCY<select disabled={!editable} value={value(selectedNode.configuration,'currency')} onChange={(event)=>setConfig('currency',event.target.value)}>{metadata.currencies.map((item)=><option key={item.code}>{item.code}</option>)}</select></label><label>PRODUCT CODE<input disabled={!editable} value={value(selectedNode.configuration,'productCode')} onChange={(event)=>setConfig('productCode',event.target.value)}/></label></div>
    </>}
    {selectedNode.type==='CREDIT_SCORE'&&<label>SCORE PROVIDER<select disabled={!editable} value={value(selectedNode.configuration,'providerCode')} onChange={(event)=>setConfig('providerCode',event.target.value)}><option value="">Select active provider</option>{metadata.scoreProviders.map((item)=><option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select></label>}
    {selectedNode.type==='CREDIT_POLICY'&&<div className={styles.fieldGrid}><label>CREDIT POLICY<select disabled={!editable} value={value(selectedNode.configuration,'policyCode')} onChange={(event)=>setConfig('policyCode',event.target.value)}><option value="">Select active policy</option>{metadata.creditPolicies.map((item)=><option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select></label><label>POLICY VERSION<input disabled={!editable} type="number" min={1} value={value(selectedNode.configuration,'policyVersion')} onChange={(event)=>setConfig('policyVersion',Number(event.target.value))}/></label></div>}
    {selectedNode.type==='CHANNEL_HANDOFF'&&<label>TARGET CHANNEL<select disabled={!editable} value={value(selectedNode.configuration,'targetChannel')} onChange={(event)=>setConfig('targetChannel',event.target.value)}><option value="">Select channel</option>{metadata.channels.map((item)=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label>}
  </>;
  const outgoing=graph.transitions.map((edge,index)=>({edge,index})).filter(({edge})=>edge.from===selectedNodeKey);

  return <section className={styles.workspace}>
    <header className={styles.header}>
      <div><span>CONFIGURABLE CUSTOMER ENTRY</span><h1>Onboarding journey studio</h1><p>Design channel-specific registration, KYC, wallet and credit journeys with governed versions.</p></div>
      <div className={styles.headerActions}><button onClick={()=>void load()} aria-label="Refresh journeys"><RefreshCw className={busy==='load'?styles.spin:''}/></button><button className={styles.primary} onClick={()=>setCreateOpen(true)}><Plus/> NEW JOURNEY</button></div>
    </header>
    {notice&&<div className={`${styles.notice} ${styles[notice.tone]}`} role="status">{notice.tone==='success'?<CheckCircle2/>:<XCircle/>}<span>{notice.text}</span></div>}
    <div className={styles.shell}>
      <aside className={styles.library}>
        <div className={styles.panelTitle}><span>JOURNEYS</span><small>{journeys.length}</small></div>
        <div className={styles.journeyList}>{journeys.map((journey)=><button key={journey.id} className={journey.id===selectedJourneyId?styles.selected:''} onClick={()=>selectJourney(journey)}><strong>{journey.name}</strong><span>{journey.code}</span><small>{journey.versions[0]?.status||'NO VERSION'}</small></button>)}</div>
        <div className={styles.panelTitle}><span>NODE LIBRARY</span><small>DRAG OR ADD</small></div>
        <div className={styles.palette}>{palette.map((item)=>{const Icon=nodeIcon(item.type);return <button key={item.type} draggable={editable} disabled={!editable} onDragStart={(event)=>event.dataTransfer.setData('application/finify-node',item.type)} onClick={()=>addNode(item.type)}><GripVertical/><Icon/><span><strong>{item.label}</strong><small>{item.group}</small></span><Plus/></button>;})}</div>
      </aside>
      <main className={styles.main}>
        <div className={styles.toolbar}>
          <div><strong>{selectedJourney?.name||'Select a journey'}</strong>{version&&<><label className={styles.versionSelect}>VERSION<select aria-label="Journey version" value={version.id} onChange={(event)=>void openVersion(event.target.value)}>{selectedJourney?.versions.map((item)=><option key={item.id} value={item.id}>v{item.versionNumber} · {item.status}</option>)}</select></label><i className={styles[statusTone(version.status)]}>{version.status}</i><small>REV {version.revision}</small>{dirty&&<b className={styles.unsaved}>UNSAVED</b>}</>}</div>
          <div><button disabled={!version||dirty||busy!==''} onClick={()=>void createVersion()} title={dirty?'Save or discard changes first':'Create a cloned draft version'}><CopyPlus/> NEW VERSION</button><button disabled={!editable||!dirty||busy!==''} onClick={()=>void save()}><Save/> SAVE</button><button disabled={!version||dirty||busy!==''} onClick={()=>void validate()} title={dirty?'Save before validation':''}><ShieldCheck/> VALIDATE</button><button disabled={!version||dirty||busy!==''} onClick={()=>setSimulationOpen(true)} title={dirty?'Save before simulation':''}><Play/> SIMULATE</button>{version?.status==='DRAFT'&&<button disabled={dirty||busy!==''} onClick={()=>void transition('submit')}><Send/> SUBMIT</button>}{version?.status==='SUBMITTED'&&canCheck&&<button className={styles.primary} disabled={busy!==''} onClick={()=>void transition('approve')}><CheckCircle2/> APPROVE</button>}{version?.status==='APPROVED'&&canCheck&&<button className={styles.primary} disabled={busy!==''} onClick={()=>void transition('activate')}><Workflow/> ACTIVATE</button>}</div>
        </div>
        {version&&<section className={styles.scopeBar}><div className={styles.scopeHeading}><div><strong>Journey applicability</strong><span>Country, channel and customer segment routing</span></div><button disabled={!editable} onClick={()=>changeGraph((current)=>({...current,scopes:[...current.scopes,{countryCode:'UGA',channelCode:metadata.channels[0]?.code||'MOBILE_APP',customerType:'INDIVIDUAL',priority:100}]}))}><Plus/> ADD SCOPE</button></div>{graph.scopes.map((scope,index)=><div className={styles.scopeRow} key={`${index}-${scope.channelCode}`}><label>COUNTRY<input disabled={!editable} maxLength={3} value={scope.countryCode} onChange={(event)=>updateScope(index,{countryCode:event.target.value.toUpperCase()})}/></label><label>CHANNEL<select disabled={!editable} value={scope.channelCode} onChange={(event)=>updateScope(index,{channelCode:event.target.value})}>{metadata.channels.map((item)=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>CUSTOMER TYPE<input disabled={!editable} value={scope.customerType} onChange={(event)=>updateScope(index,{customerType:event.target.value.toUpperCase()})}/></label><label>PRIORITY<input disabled={!editable} type="number" value={scope.priority} onChange={(event)=>updateScope(index,{priority:Number(event.target.value)})}/></label><button className={styles.iconDanger} aria-label={`Remove scope ${index+1}`} disabled={!editable||graph.scopes.length===1} onClick={()=>changeGraph((current)=>({...current,scopes:current.scopes.filter((_,scopeIndex)=>scopeIndex!==index)}))}><Trash2/></button></div>)}</section>}
        <div className={styles.canvasToolbar}><span>VISUAL FLOW</span><button disabled={!editable} onClick={autoLayout}><LayoutGrid/> AUTO LAYOUT</button><small>Drag nodes to reposition · select a node to edit routing</small></div>
        <div className={styles.canvas} onDragOver={(event)=>event.preventDefault()} onDrop={onDrop} onPointerMove={moveNode} onPointerUp={()=>{dragNode.current=null;}} onPointerCancel={()=>{dragNode.current=null;}}>
          {!version&&<div className={styles.empty}><Workflow/><h2>Select or create a journey</h2><p>The visual graph and governed version controls will appear here.</p></div>}
          {version&&<><svg className={styles.edges} aria-hidden="true">{graph.transitions.map((edge,index)=>{const from=graph.nodes.find((node)=>node.key===edge.from);const to=graph.nodes.find((node)=>node.key===edge.to);if(!from||!to)return null;return <g key={`${edge.from}-${edge.to}-${index}`}><path d={`M ${from.position.x+168} ${from.position.y+42} C ${from.position.x+230} ${from.position.y+42}, ${to.position.x-62} ${to.position.y+42}, ${to.position.x} ${to.position.y+42}`}/><text x={(from.position.x+to.position.x)/2+70} y={(from.position.y+to.position.y)/2+30}>{edge.outcome}</text></g>;})}</svg>{graph.nodes.map((node)=>{const Icon=nodeIcon(node.type);return <button key={node.key} className={`${styles.node} ${selectedNodeKey===node.key?styles.nodeSelected:''}`} style={{left:node.position.x,top:node.position.y}} onPointerDown={(event)=>startNodeMove(event,node)} onClick={()=>setSelectedNodeKey(node.key)}><span><Icon/></span><div><small>{node.type.replaceAll('_',' ')}</small><strong>{node.name}</strong><em>{node.key}</em></div></button>;})}</>}
        </div>
        {(validation||trace.length>0)&&<div className={styles.results} role="status"><div><strong>{validation?.valid?'VALID JOURNEY':'ACTION REQUIRED'}</strong><span>{validation?.issues.length||0} validation findings</span></div><div className={styles.trace}>{trace.map((step,index)=><span key={`${step.nodeKey}-${index}`}><b>{index+1}</b>{step.nodeKey}<small>{step.outcome||step.nodeType}</small></span>)}</div>{validation?.issues.map((issue)=><p key={`${issue.code}-${issue.nodeKey||''}`}><XCircle/>{issue.code}: {issue.message}</p>)}</div>}
      </main>
      <aside className={styles.inspector}>
        <div className={styles.panelTitle}><span>INSPECTOR</span><small>{version&&selectedNode?selectedNode.type:'NO NODE'}</small></div>
        {version&&selectedNode?<div className={styles.fields}><label>NODE NAME<input disabled={!editable} value={selectedNode.name} onChange={(event)=>updateNode({name:event.target.value})}/></label><label>NODE KEY<input disabled value={selectedNode.key}/></label>{configFields}<div className={styles.sectionLabel}><strong>OUTGOING ROUTES</strong><span>{outgoing.length}</span></div>{outgoing.map(({edge,index})=><div className={styles.edgeEditor} key={`${edge.from}-${index}`}><label>OUTCOME<input disabled={!editable} value={edge.outcome} onChange={(event)=>updateEdge(index,{outcome:event.target.value.toUpperCase()})}/></label><label>TARGET<select disabled={!editable} value={edge.to} onChange={(event)=>updateEdge(index,{to:event.target.value})}>{graph.nodes.filter((node)=>node.key!==selectedNode.key).map((node)=><option key={node.key} value={node.key}>{node.name}</option>)}</select></label><label>PRIORITY<input disabled={!editable} type="number" value={edge.priority} onChange={(event)=>updateEdge(index,{priority:Number(event.target.value)})}/></label><button aria-label={`Remove ${edge.outcome} route`} disabled={!editable} onClick={()=>changeGraph((current)=>({...current,transitions:current.transitions.filter((_,edgeIndex)=>edgeIndex!==index)}))}><Trash2/></button></div>)}{selectedNode.type!=='END'&&<button disabled={!editable||graph.nodes.length<2} onClick={()=>changeGraph((current)=>({...current,transitions:[...current.transitions,{from:selectedNode.key,to:current.nodes.find((node)=>node.key!==selectedNode.key)?.key||'',outcome:'SUCCESS',priority:outgoing.length+1}]}))}><Plus/> ADD ROUTE</button>}<button className={styles.advancedToggle} aria-expanded={advancedOpen} onClick={()=>setAdvancedOpen((current)=>!current)}>ADVANCED JSON <ChevronDown className={advancedOpen?styles.chevronOpen:''}/></button>{advancedOpen&&<><label>CONFIGURATION JSON<textarea disabled={!editable} rows={10} value={configurationDraft} onChange={(event)=>setConfigurationDraft(event.target.value)}/></label><button disabled={!editable} onClick={applyConfiguration}><Save/> APPLY JSON</button></>}{!['START','END'].includes(selectedNode.type)&&<button className={styles.danger} disabled={!editable} onClick={()=>setConfirmRemove(true)}><Trash2/> REMOVE NODE</button>}<div className={styles.guidance}><ShieldCheck/><p>Secrets are referenced by configuration code. They are never stored in the journey graph.</p></div></div>:<div className={styles.emptyInspector}>Select a journey and node to configure it.</div>}
      </aside>
    </div>
    {createOpen&&<div className={styles.modalLayer} role="dialog" aria-modal="true" aria-labelledby="create-journey-title"><button className={styles.backdrop} onClick={()=>setCreateOpen(false)} aria-label="Close create journey"/><div className={styles.modal}><span>NEW CONFIGURATION</span><h2 id="create-journey-title">Create onboarding journey</h2><label>TENANT UUID<input autoFocus required value={createForm.tenantId} onChange={(event)=>setCreateForm({...createForm,tenantId:event.target.value})}/></label><label>JOURNEY CODE<input required value={createForm.code} onChange={(event)=>setCreateForm({...createForm,code:event.target.value.toUpperCase()})}/></label><label>NAME<input required value={createForm.name} onChange={(event)=>setCreateForm({...createForm,name:event.target.value})}/></label><label>DESCRIPTION<textarea rows={3} value={createForm.description} onChange={(event)=>setCreateForm({...createForm,description:event.target.value})}/></label><div><button onClick={()=>setCreateOpen(false)}>CANCEL</button><button className={styles.primary} disabled={busy==='create'||!createForm.tenantId||!createForm.code||!createForm.name} onClick={()=>void createJourney()}>{busy==='create'?<LoaderCircle className={styles.spin}/>:<Plus/>} CREATE</button></div></div></div>}
    {simulationOpen&&<div className={styles.modalLayer} role="dialog" aria-modal="true" aria-labelledby="simulate-title"><button className={styles.backdrop} onClick={()=>setSimulationOpen(false)} aria-label="Close simulator"/><div className={`${styles.modal} ${styles.simulationModal}`}><span>SAFE PREVIEW</span><h2 id="simulate-title">Journey simulator</h2><p>Choose branch outcomes and preview the saved journey path. Simulation does not call external providers or allocate a real wallet or limit.</p>{branchNodes.length===0?<div className={styles.guidance}><ShieldCheck/><p>This journey has no branches. The simulator will follow the single configured route.</p></div>:branchNodes.map((node)=>{const outcomes=graph.transitions.filter((edge)=>edge.from===node.key);return <label key={node.key}>{node.name.toUpperCase()} OUTCOME<select value={simulationOutcomes[node.key]||outcomes[0]?.outcome||''} onChange={(event)=>setSimulationOutcomes((current)=>({...current,[node.key]:event.target.value}))}>{outcomes.map((edge)=><option key={`${edge.outcome}-${edge.priority}`} value={edge.outcome}>{edge.outcome} → {graph.nodes.find((item)=>item.key===edge.to)?.name||edge.to}</option>)}</select></label>;})}<div><button onClick={()=>setSimulationOpen(false)}>CANCEL</button><button className={styles.primary} disabled={busy==='simulate'} onClick={()=>void simulate()}>{busy==='simulate'?<LoaderCircle className={styles.spin}/>:<Play/>} RUN SIMULATION</button></div></div></div>}
    {confirmRemove&&selectedNode&&<div className={styles.modalLayer} role="alertdialog" aria-modal="true" aria-labelledby="remove-node-title"><button className={styles.backdrop} onClick={()=>setConfirmRemove(false)} aria-label="Cancel removal"/><div className={styles.modal}><span>DESTRUCTIVE CHANGE</span><h2 id="remove-node-title">Remove {selectedNode.name}?</h2><p>The node and all routes connected to it will be removed from this draft. Save is still required to persist the change.</p><div><button onClick={()=>setConfirmRemove(false)}>CANCEL</button><button className={styles.danger} onClick={removeNode}><Trash2/> REMOVE NODE</button></div></div></div>}
  </section>;
}
