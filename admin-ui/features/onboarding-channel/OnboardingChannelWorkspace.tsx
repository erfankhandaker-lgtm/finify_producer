'use client';

import { CheckCircle2,CopyPlus,LoaderCircle,Plus,Radio,Save,Send,ShieldCheck } from 'lucide-react';
import { useCallback,useEffect,useMemo,useState } from 'react';
import styles from './OnboardingChannelWorkspace.module.css';

type RequestInit={method?:string;body?:unknown;headers?:Record<string,string>};
export type ChannelAdminRequest=<T>(route:string,init?:RequestInit)=>Promise<T>;
type Capability={nodeType:string;executionMode:'DIRECT'|'HANDOFF_ONLY'|'SERVER_ONLY'|'UNSUPPORTED';componentKey?:string};
type ChannelVersion={id:string;versionNumber:number;status:string;revision:number;authenticationMode:string;
  sessionTimeoutSeconds:number;resumeTimeoutSeconds:number;configuration:Record<string,unknown>;
  countries:Array<{countryCode:string;configuration?:Record<string,unknown>}>;capabilities:Capability[]};
type Channel={id:string;tenantId:string;code:string;name:string;description?:string;isEnabled:boolean;versions:ChannelVersion[]};
type Metadata={nodeTypes:Array<{code:string;name:string;category:string}>};
const modes=['DIRECT','HANDOFF_ONLY','SERVER_ONLY','UNSUPPORTED'] as const;
const serverNodes=new Set(['WALLET_ALLOCATION','CREDIT_SCORE','CREDIT_POLICY','LIMIT_ALLOCATION','DECISION']);

export default function OnboardingChannelWorkspace({request,profile}:{request:ChannelAdminRequest;profile?:{roles?:string[];permissions?:string[]}}){
  const [channels,setChannels]=useState<Channel[]>([]);const [metadata,setMetadata]=useState<Metadata>({nodeTypes:[]});
  const [selectedId,setSelectedId]=useState('');const [version,setVersion]=useState<ChannelVersion|null>(null);
  const [tenantFilter,setTenantFilter]=useState('');const [busy,setBusy]=useState('');const [dirty,setDirty]=useState(false);
  const [notice,setNotice]=useState<{tone:'success'|'error';text:string}|null>(null);const [createOpen,setCreateOpen]=useState(false);
  const [create,setCreate]=useState({tenantId:'',code:'',name:'',description:'',countries:'UGA'});
  const selected=useMemo(()=>channels.find(item=>item.id===selectedId)||null,[channels,selectedId]);
  const editable=Boolean(version&&['DRAFT','REJECTED'].includes(version.status));
  const canCheck=Boolean(profile?.roles?.includes('super_admin')||profile?.permissions?.includes('onboarding_channels.check'));
  const load=useCallback(async()=>{setBusy('load');try{
    const query=tenantFilter?`?tenantId=${encodeURIComponent(tenantFilter)}`:'';
    const [items,meta]=await Promise.all([request<Channel[]>(`/api/v1/admin/onboarding/channels${query}`),request<Metadata>('/api/v1/admin/onboarding/metadata')]);
    setChannels(items);setMetadata(meta);setNotice(null);
  }catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}},[request,tenantFilter]);
  useEffect(()=>{void load();},[load]);
  const openVersion=async(id:string)=>{setBusy('version');try{setVersion(await request<ChannelVersion>(`/api/v1/admin/onboarding/channels/versions/${id}`));setDirty(false);}catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}};
  const selectChannel=(channel:Channel)=>{setSelectedId(channel.id);const candidate=channel.versions[0];if(candidate)void openVersion(candidate.id);else setVersion(null);};
  const defaultCapabilities=()=>metadata.nodeTypes.map(node=>({nodeType:node.code,executionMode:serverNodes.has(node.code)?'SERVER_ONLY' as const:'DIRECT' as const,componentKey:serverNodes.has(node.code)?undefined:node.code.toLowerCase()}));
  const createChannel=async()=>{setBusy('create');try{const countries=create.countries.split(',').map(value=>value.trim().toUpperCase()).filter(Boolean).map(countryCode=>({countryCode}));
    const result=await request<Channel&{version:ChannelVersion}>('/api/v1/admin/onboarding/channels',{method:'POST',body:{...create,code:create.code.toUpperCase(),authenticationMode:'PUBLIC_PREAUTH',sessionTimeoutSeconds:900,resumeTimeoutSeconds:604800,configuration:{},countries,capabilities:defaultCapabilities()}});
    setCreateOpen(false);setNotice({tone:'success',text:'Channel draft created'});await load();setSelectedId(result.id);setVersion(result.version);
  }catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}};
  const save=async()=>{if(!version)return;setBusy('save');try{const updated=await request<ChannelVersion>(`/api/v1/admin/onboarding/channels/versions/${version.id}`,{method:'PUT',headers:{'If-Match':String(version.revision)},body:{authenticationMode:version.authenticationMode,sessionTimeoutSeconds:Number(version.sessionTimeoutSeconds),resumeTimeoutSeconds:Number(version.resumeTimeoutSeconds),configuration:version.configuration||{},countries:version.countries,capabilities:version.capabilities}});setVersion(updated);setDirty(false);setNotice({tone:'success',text:'Channel version saved'});}catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}};
  const transition=async(action:string)=>{if(!version)return;setBusy(action);try{const updated=await request<ChannelVersion>(`/api/v1/admin/onboarding/channels/versions/${version.id}/${action}`,{method:'POST',body:{}});setVersion(updated);setDirty(false);setNotice({tone:'success',text:`Channel ${action} completed`});await load();}catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}};
  const newVersion=async()=>{if(!selected||!version)return;setBusy('clone');try{const created=await request<ChannelVersion>(`/api/v1/admin/onboarding/channels/${selected.id}/versions`,{method:'POST',body:{cloneFromVersionId:version.id,changeSummary:'Channel configuration update'}});setVersion(created);setNotice({tone:'success',text:'New draft version created'});await load();}catch(error){setNotice({tone:'error',text:(error as Error).message});}finally{setBusy('');}};
  const update=(patch:Partial<ChannelVersion>)=>{if(version){setVersion({...version,...patch});setDirty(true);}};
  const updateCapability=(nodeType:string,executionMode:Capability['executionMode'])=>update({capabilities:version!.capabilities.map(item=>item.nodeType===nodeType?{...item,executionMode}:item)});
  return <section className={styles.workspace}>
    <header><div><span>CONFIGURABLE CUSTOMER ENTRY</span><h1>Channel management</h1><p>Govern trusted entry points, country availability, session policy and journey-node capabilities.</p></div><button onClick={()=>setCreateOpen(true)}><Plus/> NEW CHANNEL</button></header>
    {notice&&<div className={`${styles.notice} ${styles[notice.tone]}`}>{notice.text}</div>}
    <div className={styles.layout}><aside><div className={styles.filter}><label>TENANT UUID<input value={tenantFilter} onChange={event=>setTenantFilter(event.target.value)} placeholder="Filter tenant"/></label></div>{channels.map(channel=><button key={channel.id} className={channel.id===selectedId?styles.selected:''} onClick={()=>selectChannel(channel)}><Radio/><span><strong>{channel.name}</strong><small>{channel.code} · {channel.versions[0]?.status||'NO VERSION'}</small></span></button>)}</aside>
      <main>{!version?<div className={styles.empty}><Radio/><h2>Select or create a channel</h2><p>Channel versions and capability controls will appear here.</p></div>:<>
        <div className={styles.toolbar}><div><strong>{selected?.name}</strong><select value={version.id} onChange={event=>void openVersion(event.target.value)}>{selected?.versions.map(item=><option key={item.id} value={item.id}>v{item.versionNumber} · {item.status}</option>)}</select><i>{version.status}</i>{dirty&&<b>UNSAVED</b>}</div><div><button disabled={dirty||busy!==''} onClick={()=>void newVersion()}><CopyPlus/> NEW VERSION</button><button disabled={!editable||!dirty||busy!==''} onClick={()=>void save()}><Save/> SAVE</button>{version.status==='DRAFT'&&<button disabled={dirty||busy!==''} onClick={()=>void transition('submit')}><Send/> SUBMIT</button>}{version.status==='SUBMITTED'&&canCheck&&<button onClick={()=>void transition('approve')}><ShieldCheck/> APPROVE</button>}{version.status==='APPROVED'&&canCheck&&<button className={styles.primary} onClick={()=>void transition('activate')}><CheckCircle2/> ACTIVATE</button>}</div></div>
        <div className={styles.formGrid}><label>AUTHENTICATION MODE<select disabled={!editable} value={version.authenticationMode} onChange={event=>update({authenticationMode:event.target.value})}>{['PUBLIC_PREAUTH','APP_ATTESTATION','OAUTH2_CLIENT','MTLS','SIGNED_WEBHOOK','AGENT_SESSION'].map(value=><option key={value}>{value}</option>)}</select></label><label>SESSION TIMEOUT (SECONDS)<input disabled={!editable} type="number" value={version.sessionTimeoutSeconds} onChange={event=>update({sessionTimeoutSeconds:Number(event.target.value)})}/></label><label>RESUME TIMEOUT (SECONDS)<input disabled={!editable} type="number" value={version.resumeTimeoutSeconds} onChange={event=>update({resumeTimeoutSeconds:Number(event.target.value)})}/></label><label>COUNTRIES<input disabled={!editable} value={version.countries.map(item=>item.countryCode).join(', ')} onChange={event=>update({countries:event.target.value.split(',').map(value=>value.trim().toUpperCase()).filter(Boolean).map(countryCode=>({countryCode}))})}/></label></div>
        <section className={styles.matrix}><div><strong>NODE CAPABILITY MATRIX</strong><span>Activation of an incompatible journey is blocked</span></div>{version.capabilities.map(capability=><label key={capability.nodeType}><span>{capability.nodeType.replaceAll('_',' ')}</span><select disabled={!editable} value={capability.executionMode} onChange={event=>updateCapability(capability.nodeType,event.target.value as Capability['executionMode'])}>{modes.map(mode=><option key={mode}>{mode}</option>)}</select></label>)}</section>
      </>}</main></div>
    {createOpen&&<div className={styles.modalLayer}><button className={styles.backdrop} aria-label="Close" onClick={()=>setCreateOpen(false)}/><div className={styles.modal}><span>NEW GOVERNED CHANNEL</span><h2>Create channel draft</h2>{(['tenantId','code','name','description','countries'] as const).map(key=><label key={key}>{key.replaceAll(/([A-Z])/g,' $1').toUpperCase()}<input value={create[key]} onChange={event=>setCreate({...create,[key]:event.target.value})}/></label>)}<div><button onClick={()=>setCreateOpen(false)}>CANCEL</button><button className={styles.primary} disabled={busy==='create'||!create.tenantId||!create.code||!create.name} onClick={()=>void createChannel()}>{busy==='create'?<LoaderCircle/>:<Plus/>} CREATE</button></div></div></div>}
  </section>;
}
