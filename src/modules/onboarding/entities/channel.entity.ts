import { Column,Entity,Index,JoinColumn,ManyToOne,OneToMany,PrimaryGeneratedColumn } from 'typeorm';

@Entity({schema:'onboarding',name:'channel_definitions'})
@Index(['tenantId','code'],{unique:true})
export class OnboardingChannelDefinition {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({name:'tenant_id',type:'uuid'}) tenantId:string;
  @Column({type:'varchar',length:40}) code:string;
  @Column({type:'varchar',length:100}) name:string;
  @Column({type:'text',nullable:true}) description:string|null;
  @Column({name:'is_enabled',type:'boolean',default:true}) isEnabled:boolean;
  @Column({name:'created_by',type:'varchar',length:100}) createdBy:string;
  @OneToMany(()=>OnboardingChannelVersion,version=>version.definition) versions:OnboardingChannelVersion[];
}

@Entity({schema:'onboarding',name:'channel_versions'})
@Index(['channelDefinitionId','versionNumber'],{unique:true})
export class OnboardingChannelVersion {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({name:'channel_definition_id',type:'uuid'}) channelDefinitionId:string;
  @ManyToOne(()=>OnboardingChannelDefinition,definition=>definition.versions,{onDelete:'RESTRICT'})
  @JoinColumn({name:'channel_definition_id'}) definition:OnboardingChannelDefinition;
  @Column({name:'version_number',type:'integer'}) versionNumber:number;
  @Column({type:'varchar',length:16}) status:string;
  @Column({type:'integer',default:1}) revision:number;
  @Column({name:'authentication_mode',type:'varchar',length:40}) authenticationMode:string;
  @Column({name:'session_timeout_seconds',type:'integer'}) sessionTimeoutSeconds:number;
  @Column({name:'resume_timeout_seconds',type:'integer'}) resumeTimeoutSeconds:number;
  @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) configuration:Record<string,unknown>;
  @OneToMany(()=>OnboardingChannelCountryScope,country=>country.version) countries:OnboardingChannelCountryScope[];
  @OneToMany(()=>OnboardingChannelNodeCapability,capability=>capability.version) capabilities:OnboardingChannelNodeCapability[];
}

@Entity({schema:'onboarding',name:'channel_country_scopes'})
@Index(['channelVersionId','countryCode'],{unique:true})
export class OnboardingChannelCountryScope {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({name:'channel_version_id',type:'uuid'}) channelVersionId:string;
  @ManyToOne(()=>OnboardingChannelVersion,version=>version.countries,{onDelete:'CASCADE'})
  @JoinColumn({name:'channel_version_id'}) version:OnboardingChannelVersion;
  @Column({name:'country_code',type:'char',length:3}) countryCode:string;
  @Column({name:'is_enabled',type:'boolean',default:true}) isEnabled:boolean;
  @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) configuration:Record<string,unknown>;
}

@Entity({schema:'onboarding',name:'channel_node_capabilities'})
@Index(['channelVersionId','nodeType'],{unique:true})
export class OnboardingChannelNodeCapability {
  @PrimaryGeneratedColumn('uuid') id:string;
  @Column({name:'channel_version_id',type:'uuid'}) channelVersionId:string;
  @ManyToOne(()=>OnboardingChannelVersion,version=>version.capabilities,{onDelete:'CASCADE'})
  @JoinColumn({name:'channel_version_id'}) version:OnboardingChannelVersion;
  @Column({name:'node_type',type:'varchar',length:40}) nodeType:string;
  @Column({name:'execution_mode',type:'varchar',length:20}) executionMode:string;
  @Column({name:'component_key',type:'varchar',length:100,nullable:true}) componentKey:string|null;
  @Column({type:'jsonb',default:()=>"'{}'::jsonb"}) configuration:Record<string,unknown>;
}
