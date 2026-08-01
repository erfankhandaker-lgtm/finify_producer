'use client';

import {
  Activity,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  CircleDollarSign,
  GitBranch,
  GitCommitHorizontal,
  GripVertical,
  Landmark,
  ListTree,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Send,
  ShieldCheck,
  Split,
  TableProperties,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import {
  DragEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './PricingFlowWorkspace.module.css';
import {
  blankPricingFlow,
  FlowNodeId,
  flowNodeOrder,
  nodeSummary,
  pricingFlowErrors,
  PricingFlowDefinition,
  PricingFlowRecord,
  PricingSimulation,
} from './model';

type RequestInit = { method?: string; body?: unknown };
export type PricingAdminRequest = <T>(route: string, init?: RequestInit) => Promise<T>;

type Props = {
  request: PricingAdminRequest;
  profile?: {
    username?: string;
    roles?: string[];
    permissions?: string[];
  };
  initialFocus?: 'charge' | 'commission';
};

type WalletTypeOption = {
  walletId: number;
  walletName: string;
  walletDetails?: string;
  status?: boolean;
};

type KeywordOption = {
  keyword: string;
  keywordDescription?: string;
  isActive?: boolean;
  serviceStatus?: boolean;
};

const nodeMeta: Record<
  FlowNodeId,
  { label: string; eyebrow: string; icon: typeof Zap; tone: string }
> = {
  trigger: { label: 'Transaction trigger', eyebrow: 'EVENT', icon: Zap, tone: 'green' },
  route: { label: 'Wallet route', eyebrow: 'MONEY PATH', icon: Route, tone: 'cyan' },
  condition: { label: 'Amount condition', eyebrow: 'DECISION', icon: GitBranch, tone: 'amber' },
  charge: { label: 'Charge calculation', eyebrow: 'FEE', icon: CircleDollarSign, tone: 'green' },
  commission: { label: 'Commission', eyebrow: 'ALLOCATION', icon: Split, tone: 'violet' },
  settlement: { label: 'Settlement', eyebrow: 'POSTING', icon: Landmark, tone: 'cyan' },
};

function appendChargeRange(
  definition: PricingFlowDefinition,
): { definition: PricingFlowDefinition; index: number } {
  const ranges = definition.charge.ranges.map((range) => ({ ...range }));
  const previous = ranges[ranges.length - 1];
  let minimumAmount = 0;
  if (previous) {
    if (previous.maximumAmount === undefined) {
      previous.maximumAmount = Number((previous.minimumAmount + 100000).toFixed(2));
    }
    minimumAmount = Number(((previous.maximumAmount ?? 0) + 0.01).toFixed(2));
  }
  ranges.push({
    id: `amount-range-${Date.now()}`,
    minimumAmount,
    maximumAmount: Number((minimumAmount + 100000).toFixed(2)),
    chargeCalculationId:
      definition.charge.defaultCalculationId || definition.charge.calculations[0]?.id,
  });
  return {
    definition: {
      ...definition,
      charge: { ...definition.charge, mode: 'FLEXIBLE', ranges },
    },
    index: ranges.length - 1,
  };
}

function appendCommissionRange(
  definition: PricingFlowDefinition,
): { definition: PricingFlowDefinition; index: number } {
  const ranges = definition.commission.ranges.map((range) => ({ ...range }));
  const previous = ranges[ranges.length - 1];
  let minimumAmount = 0;
  if (previous) {
    if (previous.maximumAmount === undefined) {
      previous.maximumAmount = Number(
        (previous.minimumAmount + 100000).toFixed(2),
      );
    }
    minimumAmount = Number(
      ((previous.maximumAmount ?? 0) + 0.01).toFixed(2),
    );
  }
  ranges.push({
    id: `commission-range-${Date.now()}`,
    minimumAmount,
    maximumAmount: Number((minimumAmount + 100000).toFixed(2)),
    commissionCalculationId: definition.commission.defaultCalculationId,
  });
  return {
    definition: {
      ...definition,
      commission: {
        ...definition.commission,
        mode: 'FLEXIBLE',
        ranges,
      },
    },
    index: ranges.length - 1,
  };
}

export default function PricingFlowWorkspace({
  request,
  profile,
  initialFocus = 'charge',
}: Props) {
  const [flows, setFlows] = useState<PricingFlowRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [definition, setDefinition] = useState<PricingFlowDefinition>(blankPricingFlow);
  const [name, setName] = useState('Merchant payment pricing');
  const [ruleCode, setRuleCode] = useState('PMNT_STANDARD');
  const [priority, setPriority] = useState(100);
  const [selectedNode, setSelectedNode] = useState<FlowNodeId>(initialFocus);
  const [mode, setMode] = useState<'visual' | 'manual' | 'json'>('visual');
  const [jsonDraft, setJsonDraft] = useState('');
  const [amount, setAmount] = useState('100000');
  const [simulationSourceWalletType, setSimulationSourceWalletType] =
    useState(String(blankPricingFlow().route.sourceWalletType));
  const [simulationDestinationWalletType, setSimulationDestinationWalletType] =
    useState(String(blankPricingFlow().route.destinationWalletType));
  const [simulation, setSimulation] = useState<PricingSimulation | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [selectedRangeIndex, setSelectedRangeIndex] = useState(0);
  const [selectedCommissionRangeIndex, setSelectedCommissionRangeIndex] =
    useState(0);
  const [selectedChargeCalculationId, setSelectedChargeCalculationId] = useState(
    blankPricingFlow().charge.defaultCalculationId,
  );
  const [selectedCommissionCalculationId, setSelectedCommissionCalculationId] =
    useState(blankPricingFlow().commission.defaultCalculationId);
  const [walletTypes, setWalletTypes] = useState<WalletTypeOption[]>([]);
  const [keywords, setKeywords] = useState<KeywordOption[]>([]);
  const [selectedSettlementLane, setSelectedSettlementLane] =
    useState<ConnectionTarget>('charge');

  const selected = useMemo(
    () => flows.find((flow) => flow.id === selectedId) || null,
    [flows, selectedId],
  );
  const validation = useMemo(() => pricingFlowErrors(definition), [definition]);

  const load = useCallback(async () => {
    setBusy('load');
    try {
      const result = await request<PricingFlowRecord[]>(
        '/admin/operations/pricing-flows?limit=200',
      );
      setFlows(Array.isArray(result) ? result : []);
      setMessage(null);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loadAll = async <T,>(route: string) => {
        const first = await request<{
          data?: T[];
          totalPages?: number;
        }>(`${route}${route.includes('?') ? '&' : '?'}page=1&limit=200`);
        const totalPages = Math.max(1, Number(first.totalPages) || 1);
        if (totalPages === 1) return first.data || [];
        const pages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            request<{ data?: T[] }>(
              `${route}${route.includes('?') ? '&' : '?'}page=${
                index + 2
              }&limit=200`,
            ),
          ),
        );
        return [
          ...(first.data || []),
          ...pages.flatMap((page) => page.data || []),
        ];
      };
      void Promise.all([
        loadAll<WalletTypeOption>(
          '/admin/reference-data/wallet-types?search=',
        ),
        loadAll<KeywordOption>('/admin/reference-data/keywords?search='),
      ])
        .then(([walletRows, keywordRows]) => {
          setWalletTypes(walletRows);
          setKeywords(keywordRows);
        })
        .catch(() => {
          setWalletTypes([]);
          setKeywords([]);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [request]);

  const hydrate = (flow: PricingFlowRecord) => {
    setSelectedId(flow.id);
    setDefinition(flow.definition);
    setName(flow.name);
    setRuleCode(flow.ruleCode);
    setPriority(flow.priority);
    setJsonDraft(JSON.stringify(flow.definition, null, 2));
    setSimulation(null);
    setSimulationSourceWalletType(
      String(flow.definition.route.sourceWalletTypes[0] || ''),
    );
    setSimulationDestinationWalletType(
      String(flow.definition.route.destinationWalletTypes[0] || ''),
    );
    setSelectedRangeIndex(0);
    setSelectedCommissionRangeIndex(0);
    setSelectedChargeCalculationId(flow.definition.charge.defaultCalculationId);
    setSelectedCommissionCalculationId(
      flow.definition.commission.defaultCalculationId,
    );
  };

  const newDraft = () => {
    setSelectedId('');
    setDefinition(blankPricingFlow());
    setName('New pricing flow');
    setRuleCode(`PRICING_${String(flows.length + 1).padStart(2, '0')}`);
    setPriority(100);
    setSelectedNode('trigger');
    setMode('visual');
    setSimulation(null);
    setSimulationSourceWalletType(
      String(blankPricingFlow().route.sourceWalletTypes[0] || ''),
    );
    setSimulationDestinationWalletType(
      String(blankPricingFlow().route.destinationWalletTypes[0] || ''),
    );
    setSelectedRangeIndex(0);
    setSelectedCommissionRangeIndex(0);
    setSelectedChargeCalculationId(blankPricingFlow().charge.defaultCalculationId);
    setSelectedCommissionCalculationId(
      blankPricingFlow().commission.defaultCalculationId,
    );
    setMessage(null);
  };

  const addRange = () => {
    if (!canEdit) return;
    const next = appendChargeRange(definition);
    setDefinition(next.definition);
    setSelectedRangeIndex(next.index);
    setSelectedChargeCalculationId(
      next.definition.charge.ranges[next.index].chargeCalculationId,
    );
    setSelectedNode('charge');
  };

  const addCommissionRange = () => {
    if (!canEdit) return;
    const next = appendCommissionRange(definition);
    setDefinition(next.definition);
    setSelectedCommissionRangeIndex(next.index);
    setSelectedCommissionCalculationId(
      next.definition.commission.ranges[next.index].commissionCalculationId,
    );
    setSelectedNode('commission');
  };

  const save = async () => {
    if (validation.length) {
      setMessage({ tone: 'error', text: validation[0] });
      return;
    }
    setBusy('save');
    try {
      const result = selected
        ? await request<PricingFlowRecord>(`/admin/operations/pricing-flows/${selected.id}`, {
            method: 'PATCH',
            body: { name, priority, definition },
          })
        : await request<PricingFlowRecord>('/admin/operations/pricing-flows', {
            method: 'POST',
            body: { ruleCode, name, priority, definition },
          });
      await load();
      hydrate(result);
      setMessage({
        tone: 'success',
        text: `${result.ruleCode} v${result.version} saved as a governed draft.`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  };

  const transition = async (
    action: 'submit' | 'approve' | 'activate' | 'retire',
  ) => {
    if (!selected) {
      setMessage({ tone: 'error', text: 'Save this flow before changing its lifecycle.' });
      return;
    }
    setBusy(action);
    try {
      const result = await request<PricingFlowRecord>(
        `/admin/operations/pricing-flows/${selected.id}/${action}`,
        { method: 'POST', body: {} },
      );
      await load();
      hydrate(result);
      setMessage({
        tone: 'success',
        text: `${result.ruleCode} moved to ${result.status}.`,
      });
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  };

  const simulate = async () => {
    if (validation.length) {
      setMessage({ tone: 'error', text: validation[0] });
      return;
    }
    if (
      !simulationSourceWalletType ||
      !simulationDestinationWalletType
    ) {
      setMessage({
        tone: 'error',
        text: 'Select both a source wallet and a destination wallet for simulation.',
      });
      return;
    }
    setBusy('simulate');
    try {
      const result = await request<PricingSimulation>(
        '/admin/operations/pricing-flows/simulate',
        {
          method: 'POST',
          body: {
            amount,
            sourceWalletType: Number(simulationSourceWalletType),
            destinationWalletType: Number(simulationDestinationWalletType),
            definition,
          },
        },
      );
      setSimulation(result);
      setMessage(null);
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy('');
    }
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft) as PricingFlowDefinition;
      const keywords = Array.isArray(parsed.trigger.keywords)
        ? parsed.trigger.keywords
        : [parsed.trigger.keyword].filter(Boolean);
      const sourceWalletTypes = Array.isArray(
        parsed.route.sourceWalletTypes,
      )
        ? parsed.route.sourceWalletTypes
        : [parsed.route.sourceWalletType].filter(Boolean);
      const destinationWalletTypes = Array.isArray(
        parsed.route.destinationWalletTypes,
      )
        ? parsed.route.destinationWalletTypes
        : [parsed.route.destinationWalletType].filter(
            (walletType): walletType is number => walletType !== undefined,
          );
      const next: PricingFlowDefinition = {
        ...parsed,
        trigger: {
          ...parsed.trigger,
          keyword: keywords[0] || '',
          keywords,
        },
        route: {
          ...parsed.route,
          sourceWalletType: sourceWalletTypes[0] || 0,
          sourceWalletTypes,
          destinationWalletType: destinationWalletTypes[0],
          destinationWalletTypes,
        },
      };
      const errors = pricingFlowErrors(next);
      if (errors.length) throw new Error(errors[0]);
      setDefinition(next);
      setMessage({ tone: 'success', text: 'Manual JSON applied to the visual flow.' });
      setMode('visual');
    } catch (error) {
      setMessage({ tone: 'error', text: `JSON not applied: ${(error as Error).message}` });
    }
  };

  const isSuperAdmin = profile?.roles?.includes('super_admin') === true;
  const canMake =
    isSuperAdmin || profile?.permissions?.includes('pricing_rules.make') === true;
  const canCheck =
    isSuperAdmin || profile?.permissions?.includes('pricing_rules.check') === true;
  const maker = selected?.modifiedBy || selected?.createdBy || '';
  const isMaker =
    Boolean(selected && profile?.username) &&
    maker.trim().toLowerCase() === profile?.username?.trim().toLowerCase();
  const canEdit =
    canMake && (!selected || ['DRAFT', 'REJECTED'].includes(selected.status));
  const canApprove = Boolean(
    selected?.status === 'SUBMITTED' && canCheck && !isMaker,
  );

  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p>PRICING CONTROL / VISUAL ORCHESTRATION</p>
          <h1>Charge & commission flow</h1>
          <span>
            Design transaction pricing as an auditable process, then simulate, review, and
            activate it.
          </span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} onClick={newDraft}>
            <Plus /> New flow
          </button>
          {canEdit && (
            <button
              className={selected ? styles.secondaryButton : styles.primaryButton}
              onClick={() => void save()}
              disabled={Boolean(busy)}
            >
              {busy === 'save' ? <LoaderCircle className={styles.spin} /> : <Save />}
              Save draft
            </button>
          )}
          {selected?.status === 'DRAFT' && canMake && (
            <button
              className={styles.primaryButton}
              onClick={() => void transition('submit')}
              disabled={Boolean(busy)}
            >
              {busy === 'submit' ? <LoaderCircle className={styles.spin} /> : <Send />}
              Submit for approval
            </button>
          )}
          {selected?.status === 'SUBMITTED' && (
            <button
              className={styles.primaryButton}
              onClick={() => void transition('approve')}
              disabled={!canApprove || Boolean(busy)}
              title={isMaker ? 'A different administrator must approve this flow' : undefined}
            >
              {busy === 'approve' ? (
                <LoaderCircle className={styles.spin} />
              ) : (
                <ShieldCheck />
              )}
              {isMaker ? 'Awaiting another checker' : 'Approve flow'}
            </button>
          )}
          {selected?.status === 'APPROVED' && canCheck && (
            <button
              className={styles.primaryButton}
              onClick={() => void transition('activate')}
              disabled={Boolean(busy)}
            >
              {busy === 'activate' ? <LoaderCircle className={styles.spin} /> : <Zap />}
              Activate flow
            </button>
          )}
        </div>
      </header>

      {message && (
        <div className={`${styles.notice} ${styles[message.tone]}`}>
          {message.tone === 'success' ? <Check /> : <X />}
          <span>{message.text}</span>
        </div>
      )}

      <div className={styles.controlBar}>
        <label className={styles.flowSelector}>
          <span>PRICING FLOW</span>
          <div>
            <GitCommitHorizontal />
            <select
              value={selectedId}
              onChange={(event) => {
                const flow = flows.find((item) => item.id === event.target.value);
                if (flow) hydrate(flow);
                else newDraft();
              }}
            >
              <option value="">UNSAVED DRAFT / {ruleCode}</option>
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.ruleCode} v{flow.version} · {flow.status}
                </option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </label>
        <div className={styles.identityFields}>
          <label>
            RULE CODE
            <input
              value={ruleCode}
              disabled={Boolean(selected)}
              onChange={(event) =>
                setRuleCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
              }
            />
          </label>
          <label>
            FLOW NAME
            <input value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            PRIORITY
            <input
              inputMode="numeric"
              value={priority}
              disabled={!canEdit}
              onChange={(event) => setPriority(Number(event.target.value.replace(/\D/g, '')) || 1)}
            />
          </label>
        </div>
        <span className={`${styles.status} ${styles[(selected?.status || 'draft').toLowerCase()]}`}>
          <i /> {selected?.status || 'DRAFT'}
        </span>
      </div>

      <div className={styles.modeBar}>
        <div>
          <button
            className={mode === 'visual' ? styles.activeMode : ''}
            onClick={() => setMode('visual')}
          >
            <ListTree /> Visual canvas
          </button>
          <button
            className={mode === 'manual' ? styles.activeMode : ''}
            onClick={() => setMode('manual')}
          >
            <TableProperties /> Manual fields
          </button>
          <button
            className={mode === 'json' ? styles.activeMode : ''}
            onClick={() => {
              setJsonDraft(JSON.stringify(definition, null, 2));
              setMode('json');
            }}
          >
            <Braces /> JSON contract
          </button>
        </div>
        <div className={styles.lifecycle}>
          <button disabled={!selected || selected.status !== 'DRAFT' || !canMake || Boolean(busy)} onClick={() => void transition('submit')}>
            <Send /> Submit
          </button>
          <button
            disabled={!canApprove || Boolean(busy)}
            title={isMaker ? 'A different administrator must approve this flow' : undefined}
            onClick={() => void transition('approve')}
          >
            <ShieldCheck /> Approve
          </button>
          <button disabled={!selected || selected.status !== 'APPROVED' || !canCheck || Boolean(busy)} onClick={() => void transition('activate')}>
            <Zap /> Activate
          </button>
          <button disabled={!selected || !['ACTIVE', 'APPROVED'].includes(selected.status) || !canCheck || Boolean(busy)} onClick={() => void transition('retire')}>
            Retire
          </button>
        </div>
      </div>

      {mode === 'visual' && (
        <div className={`${styles.builder} ${libraryOpen ? '' : styles.libraryClosed}`}>
          <aside className={styles.library}>
            <div className={styles.panelHead}>
              <div>
                <span>FLOW COMPONENTS</span>
                <strong>Node library</strong>
              </div>
              <button onClick={() => setLibraryOpen(false)} aria-label="Collapse node library">
                <X />
              </button>
            </div>
            <p>Choose a component to configure its rule contract.</p>
            <div className={styles.nodeLibrary}>
              {flowNodeOrder.map((node) => {
                const meta = nodeMeta[node];
                const Icon = meta.icon;
                return (
                  <button
                    key={node}
                    className={selectedNode === node ? styles.selectedLibraryNode : ''}
                    onClick={() => setSelectedNode(node)}
                    draggable={node === 'condition' && canEdit}
                    onDragStart={(event) => {
                      if (node !== 'condition') return;
                      event.dataTransfer.setData(
                        'application/x-finify-pricing-node',
                        'condition',
                      );
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <GripVertical />
                    <span className={styles[meta.tone]}><Icon /></span>
                    <div>
                      <small>{meta.eyebrow}</small>
                      <strong>{meta.label}</strong>
                      {node === 'condition' && <em>DRAG TO ADD RANGE</em>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className={styles.architectureNote}>
              <ShieldCheck />
              <div>
                <strong>Governed contract</strong>
                <span>Visual and manual modes edit the same versioned definition.</span>
              </div>
            </div>
          </aside>

          <main className={styles.canvas}>
            {!libraryOpen && (
              <button className={styles.openLibrary} onClick={() => setLibraryOpen(true)}>
                <Plus /> Components
              </button>
            )}
            <div className={styles.canvasToolbar}>
              <div>
                <span className={styles.liveDot} />
                AUTO-LAYOUT / LEFT TO RIGHT
                <small>{validation.length ? `${validation.length} VALIDATION ISSUE(S)` : 'CONTRACT VALID'}</small>
              </div>
              <button onClick={() => setDefinition({ ...definition })}>
                <RefreshCw /> Reflow
              </button>
            </div>
            <div className={`${styles.flowCanvas} ${styles.independentPricingFlow}`}>
              <div className={styles.flowRail} />
              {flowNodeOrder.slice(0, 2).map((node, index) => (
                <FlowNode
                  key={node}
                  node={node}
                  index={index}
                  active={selectedNode === node}
                  definition={definition}
                  walletTypes={walletTypes}
                  simulation={simulation}
                  onSelect={() => setSelectedNode(node)}
                />
              ))}
              <PricingConnectionGraph
                definition={definition}
                walletTypes={walletTypes}
                selectedRangeIndex={selectedRangeIndex}
                selectedCommissionRangeIndex={selectedCommissionRangeIndex}
                disabled={!canEdit}
                onSelectCondition={(target) =>
                  setSelectedNode(target === 'charge' ? 'charge' : 'commission')
                }
                onSelectRange={(target, index) => {
                  if (target === 'charge') {
                    setSelectedRangeIndex(index);
                    setSelectedChargeCalculationId(
                      definition.charge.ranges[index].chargeCalculationId,
                    );
                    setSelectedNode('charge');
                  } else {
                    setSelectedCommissionRangeIndex(index);
                    setSelectedCommissionCalculationId(
                      definition.commission.ranges[index].commissionCalculationId,
                    );
                    setSelectedNode('commission');
                  }
                }}
                onSelectCalculation={(target, id) => {
                  if (target === 'charge') {
                    setSelectedChargeCalculationId(id);
                    setSelectedNode('charge');
                  } else {
                    setSelectedCommissionCalculationId(id);
                    setSelectedNode('commission');
                  }
                }}
                onConnect={(target, index, calculationId) => {
                  if (target === 'charge') {
                    const ranges = definition.charge.ranges.map(
                      (range, rangeIndex) =>
                        rangeIndex === index
                          ? { ...range, chargeCalculationId: calculationId }
                          : range,
                    );
                    setDefinition({
                      ...definition,
                      charge: { ...definition.charge, ranges },
                    });
                    setSelectedRangeIndex(index);
                    setSelectedChargeCalculationId(calculationId);
                    setSelectedNode('charge');
                  } else {
                    const ranges = definition.commission.ranges.map(
                      (range, rangeIndex) =>
                        rangeIndex === index
                          ? { ...range, commissionCalculationId: calculationId }
                          : range,
                    );
                    setDefinition({
                      ...definition,
                      commission: { ...definition.commission, ranges },
                    });
                    setSelectedCommissionRangeIndex(index);
                    setSelectedCommissionCalculationId(calculationId);
                    setSelectedNode('commission');
                  }
                }}
              onAddRange={(target) =>
                  target === 'charge' ? addRange() : addCommissionRange()
                }
                onSelectSettlement={(target) => {
                  setSelectedSettlementLane(target);
                  setSelectedNode('settlement');
                }}
              />
            </div>
            <div className={styles.canvasLegend}>
              <span><i className={styles.legendGreen} /> Pricing action</span>
              <span><i className={styles.legendAmber} /> Decision</span>
              <span><i className={styles.legendViolet} /> Commission</span>
              <span><Activity /> Active flows execute by priority</span>
            </div>
          </main>

          <aside className={styles.inspector}>
            <Inspector
              node={selectedNode}
              definition={definition}
              disabled={!canEdit}
              selectedRangeIndex={selectedRangeIndex}
              onSelectedRangeIndex={setSelectedRangeIndex}
              selectedCommissionRangeIndex={selectedCommissionRangeIndex}
              onSelectedCommissionRangeIndex={setSelectedCommissionRangeIndex}
              selectedChargeCalculationId={selectedChargeCalculationId}
              onSelectedChargeCalculationId={setSelectedChargeCalculationId}
              selectedCommissionCalculationId={selectedCommissionCalculationId}
              onSelectedCommissionCalculationId={setSelectedCommissionCalculationId}
              walletTypes={walletTypes}
              keywords={keywords}
              selectedSettlementLane={selectedSettlementLane}
              onChange={setDefinition}
            />
          </aside>
        </div>
      )}

      {mode === 'manual' && (
        <ManualEditor definition={definition} disabled={!canEdit} onChange={setDefinition} />
      )}

      {mode === 'json' && (
        <section className={styles.jsonEditor}>
          <div className={styles.panelHead}>
            <div>
              <span>ADVANCED / MANUAL CONTRACT</span>
              <strong>Pricing definition JSON</strong>
            </div>
            <span className={styles.schemaChip}>SCHEMA v1</span>
          </div>
          <p>
            Direct changes are validated before they replace the visual flow. This is the same
            contract stored and executed by the backend.
          </p>
          <textarea
            value={jsonDraft}
            disabled={!canEdit}
            spellCheck={false}
            onChange={(event) => setJsonDraft(event.target.value)}
          />
          <div className={styles.jsonActions}>
            <button onClick={() => setJsonDraft(JSON.stringify(definition, null, 2))}>
              Reset
            </button>
            <button className={styles.primaryButton} disabled={!canEdit} onClick={applyJson}>
              <Check /> Validate & apply
            </button>
          </div>
        </section>
      )}

      <SimulationConsole
        definition={definition}
        walletTypes={walletTypes}
        amount={amount}
        sourceWalletType={simulationSourceWalletType}
        destinationWalletType={simulationDestinationWalletType}
        simulation={simulation}
        busy={busy === 'simulate'}
        onAmount={setAmount}
        onSourceWalletType={setSimulationSourceWalletType}
        onDestinationWalletType={setSimulationDestinationWalletType}
        onSimulate={() => void simulate()}
      />
    </section>
  );
}

type ConnectionTarget = 'charge' | 'commission';

function PricingConnectionGraph({
  definition,
  walletTypes,
  selectedRangeIndex,
  selectedCommissionRangeIndex,
  disabled,
  onSelectCondition,
  onSelectRange,
  onSelectCalculation,
  onConnect,
  onAddRange,
  onSelectSettlement,
}: {
  definition: PricingFlowDefinition;
  walletTypes: WalletTypeOption[];
  selectedRangeIndex: number;
  selectedCommissionRangeIndex: number;
  disabled: boolean;
  onSelectCondition: (target: ConnectionTarget) => void;
  onSelectRange: (target: ConnectionTarget, index: number) => void;
  onSelectCalculation: (target: ConnectionTarget, id: string) => void;
  onConnect: (
    target: ConnectionTarget,
    rangeIndex: number,
    calculationId: string,
  ) => void;
  onAddRange: (target: ConnectionTarget) => void;
  onSelectSettlement: (target: ConnectionTarget) => void;
}) {
  const [pending, setPending] = useState<{
    target: ConnectionTarget;
    rangeIndex: number;
  } | null>(null);
  const [wires, setWires] = useState<
    Array<{
      key: string;
      target: ConnectionTarget;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      kind: 'ROUTE' | 'BRANCH' | 'CALCULATION' | 'SETTLEMENT';
    }>
  >([]);
  const graphRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const graph = graphRef.current;
      if (!graph) return;
      const graphBox = graph.getBoundingClientRect();
      const getPort = (key: string) =>
        Array.from(
          graph.querySelectorAll<HTMLButtonElement>('[data-port-key]'),
        ).find((element) => element.dataset.portKey === key);
      const next: typeof wires = [];
      (['charge', 'commission'] as ConnectionTarget[]).forEach((target) => {
        const pricing = definition[target];
        const routePort = getPort(`wallet-route:${target}`);
        const conditionInput = getPort(
          `condition:${target}:input`,
        );
        if (routePort && conditionInput) {
          const fromBox = routePort.getBoundingClientRect();
          const toBox = conditionInput.getBoundingClientRect();
          next.push({
            key: `route:${target}`,
            target,
            kind: 'ROUTE',
            fromX: fromBox.left + fromBox.width / 2 - graphBox.left,
            fromY: fromBox.top + fromBox.height / 2 - graphBox.top,
            toX: toBox.left + toBox.width / 2 - graphBox.left,
            toY: toBox.top + toBox.height / 2 - graphBox.top,
          });
        }
        if (!pricing.enabled) return;
        const conditionPort = getPort(`condition:${target}`);
        if (pricing.mode === 'FIXED') {
          const calculationPort = getPort(
            `calculation:${target}:${pricing.defaultCalculationId}`,
          );
          if (conditionPort && calculationPort) {
            const fromBox = conditionPort.getBoundingClientRect();
            const toBox = calculationPort.getBoundingClientRect();
            next.push({
              key: `${target}:direct:${pricing.defaultCalculationId}`,
              target,
              kind: 'CALCULATION',
              fromX: fromBox.left + fromBox.width / 2 - graphBox.left,
              fromY: fromBox.top + fromBox.height / 2 - graphBox.top,
              toX: toBox.left + toBox.width / 2 - graphBox.left,
              toY: toBox.top + toBox.height / 2 - graphBox.top,
            });
          }
        } else {
          pricing.ranges.forEach((range) => {
          const rangeInput = getPort(
            `range:${target}:${range.id}:input`,
          );
          if (conditionPort && rangeInput) {
            const fromBox = conditionPort.getBoundingClientRect();
            const toBox = rangeInput.getBoundingClientRect();
            next.push({
              key: `${target}:${range.id}:branch`,
              target,
              kind: 'BRANCH',
              fromX: fromBox.left + fromBox.width / 2 - graphBox.left,
              fromY: fromBox.top + fromBox.height / 2 - graphBox.top,
              toX: toBox.left + toBox.width / 2 - graphBox.left,
              toY: toBox.top + toBox.height / 2 - graphBox.top,
            });
          }
          const calculationId =
            target === 'charge'
              ? (range as PricingFlowDefinition['charge']['ranges'][number])
                  .chargeCalculationId
              : (range as PricingFlowDefinition['commission']['ranges'][number])
                  .commissionCalculationId;
          const from = getPort(
            `range:${target}:${range.id}:output`,
          );
          const to = getPort(
            `calculation:${target}:${calculationId}`,
          );
          if (!from || !to) return;
          const fromBox = from.getBoundingClientRect();
          const toBox = to.getBoundingClientRect();
          next.push({
            key: `${range.id}:${target}:${calculationId}`,
            target,
            kind: 'CALCULATION',
            fromX: fromBox.left + fromBox.width / 2 - graphBox.left,
            fromY: fromBox.top + fromBox.height / 2 - graphBox.top,
            toX: toBox.left + toBox.width / 2 - graphBox.left,
            toY: toBox.top + toBox.height / 2 - graphBox.top,
          });
          });
        }
        const settlementPort = getPort(`settlement:${target}`);
        pricing.calculations
          .filter(
            (calculation) =>
              pricing.mode === 'FLEXIBLE' ||
              calculation.id === pricing.defaultCalculationId,
          )
          .forEach((calculation) => {
            const calculationOutput = getPort(
              `calculation:${target}:${calculation.id}:output`,
            );
            if (!calculationOutput || !settlementPort) return;
            const fromBox = calculationOutput.getBoundingClientRect();
            const toBox = settlementPort.getBoundingClientRect();
            next.push({
              key: `${target}:${calculation.id}:settlement`,
              target,
              kind: 'SETTLEMENT',
              fromX: fromBox.left + fromBox.width / 2 - graphBox.left,
              fromY: fromBox.top + fromBox.height / 2 - graphBox.top,
              toX: toBox.left + toBox.width / 2 - graphBox.left,
              toY: toBox.top + toBox.height / 2 - graphBox.top,
            });
          });
      });
      setWires(next);
    };
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [definition]);

  const startConnection = (
    event: DragEvent<HTMLButtonElement>,
    target: ConnectionTarget,
    rangeIndex: number,
  ) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(
      'application/x-finify-pricing-connection',
      JSON.stringify({ target, rangeIndex }),
    );
    event.dataTransfer.effectAllowed = 'link';
    setPending({ target, rangeIndex });
  };
  const connect = (
    target: ConnectionTarget,
    calculationId: string,
    event?: DragEvent<HTMLButtonElement>,
  ) => {
    let source = pending;
    if (event) {
      event.preventDefault();
      try {
        source = JSON.parse(
          event.dataTransfer.getData('application/x-finify-pricing-connection'),
        ) as typeof pending;
      } catch {
        source = null;
      }
    }
    if (!source || source.target !== target || disabled) return;
    onConnect(target, source.rangeIndex, calculationId);
    setPending(null);
  };
  const calculationValue = (
    calculation: PricingFlowDefinition['charge']['calculations'][number],
  ) =>
    calculation.type === 'FIXED'
      ? `${calculation.value.toLocaleString()}`
      : `${calculation.value}%${
          calculation.minimum !== undefined ? ` / MIN ${calculation.minimum}` : ''
        }${calculation.maximum !== undefined ? ` / MAX ${calculation.maximum}` : ''}`;

  const renderLane = (target: ConnectionTarget) => {
    const pricing = definition[target];
    const isCharge = target === 'charge';
    const ranges = pricing.ranges;
    const selectedIndex = isCharge
      ? selectedRangeIndex
      : selectedCommissionRangeIndex;
    const label = isCharge ? 'Charge' : 'Commission';
    const Icon = isCharge ? CircleDollarSign : Split;
    return (
      <section
        className={`${styles.pricingLane} ${
          isCharge ? styles.chargeLane : styles.commissionLane
        } ${!pricing.enabled ? styles.disabledLane : ''}`}
      >
        <div className={styles.laneIdentity}>
          <Icon />
          <div>
            <span>{label.toUpperCase()} LANE</span>
            <strong>{pricing.enabled ? 'ENABLED' : 'DISABLED'}</strong>
          </div>
        </div>

        <div
          className={`${styles.conditionGraphNode} ${
            isCharge ? styles.chargeGraphNode : styles.commissionGraphNode
          }`}
          onClick={() => onSelectCondition(target)}
        >
          <button
            data-port-key={`condition:${target}:input`}
            className={`${styles.graphPort} ${styles.conditionInputPort} ${
              isCharge ? styles.chargePort : styles.commissionPort
            }`}
            aria-label={`${label} condition input`}
          />
          <GitBranch />
          <span className={styles.graphNodeEyebrow}>{label.toUpperCase()} CONDITION</span>
          <strong>
            {!pricing.enabled ? 'No pricing' : `${pricing.mode} AMOUNT LOGIC`}
          </strong>
          <small>
            {!pricing.enabled
              ? `No ${label.toLowerCase()} will be calculated`
              : pricing.mode === 'FIXED'
                ? 'Direct calculation; no ranges'
                : `${ranges.length} independent range${ranges.length === 1 ? '' : 's'}`}
          </small>
          {pricing.enabled && (
            <button
              data-port-key={`condition:${target}`}
              className={`${styles.graphPort} ${styles.conditionOutputPort} ${
                isCharge ? styles.chargePort : styles.commissionPort
              }`}
              aria-label={`${label} condition output`}
            />
          )}
        </div>

        <div className={styles.laneRangeColumn}>
          {pricing.enabled && pricing.mode === 'FLEXIBLE' ? (
            <>
              <div className={styles.graphNodeList}>
                {ranges.map((range, index) => (
                  <div
                    key={range.id}
                    className={`${styles.rangeGraphNode} ${
                      selectedIndex === index ? styles.selectedGraphNode : ''
                    }`}
                    onClick={() => onSelectRange(target, index)}
                  >
                    <button
                      data-port-key={`range:${target}:${range.id}:input`}
                      className={`${styles.graphPort} ${styles.rangeInputPort} ${
                        isCharge ? styles.chargePort : styles.commissionPort
                      }`}
                      aria-label={`${label} range ${index + 1} input`}
                    />
                    <span className={styles.graphNodeEyebrow}>
                      {label.toUpperCase()} RANGE {String(index + 1).padStart(2, '0')}
                    </span>
                    <strong>
                      {range.minimumAmount.toLocaleString()} →{' '}
                      {range.maximumAmount?.toLocaleString() || 'NO CAP'}
                    </strong>
                    <small>Drag output to a {label.toLowerCase()} calculation</small>
                    <button
                      data-port-key={`range:${target}:${range.id}:output`}
                      className={`${styles.graphPort} ${styles.rangeOutputPort} ${
                        isCharge ? styles.chargePort : styles.commissionPort
                      }`}
                      draggable={!disabled}
                      onDragStart={(event) =>
                        startConnection(event, target, index)
                      }
                      onDragEnd={() => setPending(null)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPending({ target, rangeIndex: index });
                      }}
                      aria-label={`Connect ${label} range ${index + 1}`}
                    >
                      {isCharge ? 'C' : '%'}
                    </button>
                  </div>
                ))}
              </div>
              <button
                className={styles.rangeDropTarget}
                disabled={disabled}
                onClick={() => onAddRange(target)}
              >
                <Plus /> ADD {label.toUpperCase()} RANGE
              </button>
            </>
          ) : (
            <div className={styles.rangeBypassNode}>
              {pricing.enabled ? 'RANGE BRANCH BYPASSED' : 'LANE INACTIVE'}
            </div>
          )}
        </div>

        <div className={styles.laneCalculationColumn}>
          {pricing.enabled ? (
            <div className={styles.graphNodeList}>
              {pricing.calculations
                .filter(
                  (calculation) =>
                    pricing.mode === 'FLEXIBLE' ||
                    calculation.id === pricing.defaultCalculationId,
                )
                .map((calculation) => {
                  const connections = ranges.filter((range) =>
                    isCharge
                      ? (
                          range as PricingFlowDefinition['charge']['ranges'][number]
                        ).chargeCalculationId === calculation.id
                      : (
                          range as PricingFlowDefinition['commission']['ranges'][number]
                        ).commissionCalculationId === calculation.id,
                  ).length;
                  return (
                    <div
                      key={calculation.id}
                      className={`${styles.calculationGraphNode} ${
                        isCharge
                          ? styles.chargeGraphNode
                          : styles.commissionGraphNode
                      }`}
                      onClick={() =>
                        onSelectCalculation(target, calculation.id)
                      }
                    >
                      <button
                        data-port-key={`calculation:${target}:${calculation.id}`}
                        className={`${styles.graphPort} ${styles.calculationInputPort} ${
                          isCharge ? styles.chargePort : styles.commissionPort
                        } ${
                          pending?.target === target
                            ? styles.compatiblePort
                            : ''
                        }`}
                        onDragOver={(event) => {
                          if (
                            event.dataTransfer.types.includes(
                              'application/x-finify-pricing-connection',
                            )
                          ) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'link';
                          }
                        }}
                        onDrop={(event) =>
                          connect(target, calculation.id, event)
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          connect(target, calculation.id);
                        }}
                        aria-label={`Connect to ${calculation.name}`}
                      />
                      <button
                        data-port-key={`calculation:${target}:${calculation.id}:output`}
                        className={`${styles.graphPort} ${styles.calculationOutputPort} ${
                          isCharge ? styles.chargePort : styles.commissionPort
                        }`}
                        aria-label={`${calculation.name} settlement output`}
                      />
                      <span className={styles.graphNodeEyebrow}>
                        {label.toUpperCase()} LOGIC
                      </span>
                      <strong>{calculation.name}</strong>
                      <code>
                        {calculation.type} / {calculationValue(calculation)}
                      </code>
                      <small>
                        {pricing.mode === 'FIXED'
                          ? 'DIRECT ACTIVE'
                          : `${connections} RANGE LINK${
                              connections === 1 ? '' : 'S'
                            }`}{' '}
                        · CLICK TO EDIT
                      </small>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className={styles.graphEmptyNode}>
              NO {label.toUpperCase()} CALCULATION
            </div>
          )}
        </div>
        <div
          className={`${styles.settlementGraphNode} ${
            isCharge ? styles.chargeGraphNode : styles.commissionGraphNode
          }`}
          onClick={() => onSelectSettlement(target)}
        >
          <button
            data-port-key={`settlement:${target}`}
            className={`${styles.graphPort} ${styles.settlementInputPort} ${
              isCharge ? styles.chargePort : styles.commissionPort
            }`}
            aria-label={`${label} settlement input`}
          />
          <Landmark />
          <span className={styles.graphNodeEyebrow}>
            {label.toUpperCase()} SETTLEMENT
          </span>
          <strong>
            {walletTypes.find(
              (wallet) =>
                wallet.walletId ===
                (isCharge
                  ? definition.settlement.chargeWalletType
                  : definition.settlement.commissionWalletType),
            )?.walletName || 'UNKNOWN WALLET'}
          </strong>
          <small>CLICK TO CONFIGURE SETTLEMENT</small>
        </div>
      </section>
    );
  };

  return (
    <div
      ref={graphRef}
      className={`${styles.pricingConnectionGraph} ${
        pending ? styles.connectionPending : ''
      }`}
    >
      <div className={styles.walletRouteSplit} aria-label="Wallet route split">
        <Route />
        <span>WALLET ROUTE</span>
        <button
          data-port-key="wallet-route:charge"
          className={`${styles.graphPort} ${styles.routeChargeSource} ${styles.chargePort}`}
          aria-label="Wallet route to Charge lane"
        />
        <button
          data-port-key="wallet-route:commission"
          className={`${styles.graphPort} ${styles.routeCommissionSource} ${styles.commissionPort}`}
          aria-label="Wallet route to Commission lane"
        />
      </div>
      <svg className={styles.connectionWires} aria-hidden="true">
        {wires.map((wire) => {
          const bend = Math.max(42, (wire.toX - wire.fromX) * 0.46);
          return (
            <path
              key={wire.key}
              className={
                wire.target === 'charge'
                  ? styles.chargeWire
                  : styles.commissionWire
              }
              data-kind={wire.kind}
              d={`M ${wire.fromX} ${wire.fromY} C ${wire.fromX + bend} ${
                wire.fromY
              }, ${wire.toX - bend} ${wire.toY}, ${wire.toX} ${wire.toY}`}
            />
          );
        })}
      </svg>
      {renderLane('charge')}
      {renderLane('commission')}
    </div>
  );
}

function FlowNode({
  node,
  index,
  active,
  definition,
  walletTypes,
  simulation,
  onSelect,
}: {
  node: FlowNodeId;
  index: number;
  active: boolean;
  definition: PricingFlowDefinition;
  walletTypes: WalletTypeOption[];
  simulation: PricingSimulation | null;
  onSelect: () => void;
}) {
  const meta = nodeMeta[node];
  const Icon = meta.icon;
  const trace = simulation?.trace.find((item) => item.node === node.toUpperCase());
  return (
    <button
      className={`${styles.flowNode} ${styles[meta.tone]} ${active ? styles.activeNode : ''} ${
        trace ? styles[`trace${trace.status}`] : ''
      }`}
      onClick={onSelect}
    >
      <span className={styles.nodeIndex}>{String(index + 1).padStart(2, '0')}</span>
      <span className={styles.nodeIcon}><Icon /></span>
      <small>{meta.eyebrow}</small>
      <strong>{meta.label}</strong>
      <code>
        {node === 'route'
          ? `${definition.route.sourceWalletTypes
              .map(
                (walletId) =>
                  walletTypes.find((wallet) => wallet.walletId === walletId)
                    ?.walletName || 'Unknown wallet',
              )
              .join(', ')} → ${
              definition.route.destinationWalletTypes.length === 0
                ? 'Any destination wallet'
                : definition.route.destinationWalletTypes
                    .map(
                      (walletId) =>
                        walletTypes.find(
                          (wallet) => wallet.walletId === walletId,
                        )?.walletName || 'Unknown wallet',
                    )
                    .join(', ')
            }`
          : nodeSummary(node, definition)}
      </code>
      {node === 'charge' && (
        <span className={styles.calculationNodeList}>
          {definition.charge.calculations
            .filter(
              (calculation) =>
                definition.charge.mode === 'FLEXIBLE' ||
                calculation.id === definition.charge.defaultCalculationId,
            )
            .map((calculation) => {
            const connections = definition.charge.ranges.filter(
              (range) => range.chargeCalculationId === calculation.id,
            ).length;
            return (
              <i key={calculation.id}>
                <b>{calculation.name}</b>
                <em>
                  {definition.charge.mode === 'FIXED' &&
                  definition.charge.defaultCalculationId === calculation.id
                    ? 'DIRECT'
                    : `${connections} RANGE LINK${connections === 1 ? '' : 'S'}`}
                </em>
              </i>
            );
            })}
        </span>
      )}
      {node === 'commission' && definition.commission.enabled && (
        <span className={styles.calculationNodeList}>
          {definition.commission.calculations
            .filter(
              (calculation) =>
                definition.commission.mode === 'FLEXIBLE' ||
                calculation.id === definition.commission.defaultCalculationId,
            )
            .map((calculation) => {
            const connections = definition.commission.ranges.filter(
              (range) => range.commissionCalculationId === calculation.id,
            ).length;
            return (
              <i key={calculation.id}>
                <b>{calculation.name}</b>
                <em>
                  {definition.commission.mode === 'FIXED' &&
                  definition.commission.defaultCalculationId === calculation.id
                    ? 'DIRECT'
                    : `${connections} RANGE LINK${connections === 1 ? '' : 'S'}`}
                </em>
              </i>
            );
            })}
        </span>
      )}
      <span className={styles.nodeState}>
        <i /> {trace?.status || (active ? 'EDITING' : 'CONFIGURED')}
      </span>
      {node === 'route' ? (
        <span className={styles.routeFork}>
          <i className={styles.routeForkCharge}>CHARGE</i>
          <i className={styles.routeForkCommission}>COMMISSION</i>
        </span>
      ) : (
        index < flowNodeOrder.length - 1 && (
          <ArrowRight className={styles.nodeArrow} />
        )
      )}
    </button>
  );
}

function Inspector({
  node,
  definition,
  disabled,
  selectedRangeIndex,
  onSelectedRangeIndex,
  selectedCommissionRangeIndex,
  onSelectedCommissionRangeIndex,
  selectedChargeCalculationId,
  onSelectedChargeCalculationId,
  selectedCommissionCalculationId,
  onSelectedCommissionCalculationId,
  walletTypes,
  keywords,
  selectedSettlementLane,
  onChange,
}: {
  node: FlowNodeId;
  definition: PricingFlowDefinition;
  disabled: boolean;
  selectedRangeIndex: number;
  onSelectedRangeIndex: (index: number) => void;
  selectedCommissionRangeIndex: number;
  onSelectedCommissionRangeIndex: (index: number) => void;
  selectedChargeCalculationId: string;
  onSelectedChargeCalculationId: (id: string) => void;
  selectedCommissionCalculationId: string;
  onSelectedCommissionCalculationId: (id: string) => void;
  walletTypes: WalletTypeOption[];
  keywords: KeywordOption[];
  selectedSettlementLane: ConnectionTarget;
  onChange: (next: PricingFlowDefinition) => void;
}) {
  const meta = nodeMeta[node];
  const Icon = meta.icon;
  const number = (value: string) => (value === '' ? 0 : Number(value));
  const activeChargeCalculationId = definition.charge.calculations.some(
    (calculation) => calculation.id === selectedChargeCalculationId,
  )
    ? selectedChargeCalculationId
    : definition.charge.defaultCalculationId;
  const activeCommissionCalculationId = definition.commission.calculations.some(
    (calculation) => calculation.id === selectedCommissionCalculationId,
  )
    ? selectedCommissionCalculationId
    : definition.commission.defaultCalculationId;
  return (
    <>
      <div className={styles.inspectorHead}>
        <span className={styles[meta.tone]}><Icon /></span>
        <div>
          <small>{meta.eyebrow} NODE</small>
          <strong>{meta.label}</strong>
        </div>
      </div>
      <p>Configure this node. Changes immediately update the canvas and manual contract.</p>
      <div className={styles.inspectorForm}>
        {node === 'trigger' && (
          <>
            <MultiSelectField
              label="TRANSACTION KEYWORDS"
              values={definition.trigger.keywords}
              options={keywords
                .filter((item) => item.isActive !== false)
                .map((item) => ({
                  value: item.keyword,
                  label: item.keyword,
                  detail: item.keywordDescription,
                }))}
              placeholder="Select transaction keywords"
              noun="keyword"
              helper="Only active transaction keywords are available."
              disabled={disabled}
              onChange={(selected) =>
                onChange({
                  ...definition,
                  trigger: {
                    ...definition.trigger,
                    keyword: selected[0] || '',
                    keywords: selected,
                  },
                })
              }
            />
            <Field label="CURRENCY">
              <input
                disabled={disabled}
                maxLength={8}
                value={definition.trigger.currency}
                onChange={(event) =>
                  onChange({
                    ...definition,
                    trigger: {
                      ...definition.trigger,
                      currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
                    },
                  })
                }
              />
            </Field>
          </>
        )}
        {node === 'route' && (
          <>
            <MultiSelectField
              label="SOURCE WALLET TYPES"
              values={definition.route.sourceWalletTypes.map(String)}
              options={walletTypes
                .filter((wallet) => wallet.status !== false)
                .map((wallet) => ({
                  value: String(wallet.walletId),
                  label: wallet.walletName,
                  detail: wallet.walletDetails,
                }))}
              placeholder="Select source wallets"
              noun="source wallet"
              helper="Choose one or more active wallets. Selected wallets appear below."
              disabled={disabled}
              onChange={(selectedValues) => {
                const selected = selectedValues.map(Number);
                onChange({
                  ...definition,
                  route: {
                    ...definition.route,
                    sourceWalletType: selected[0] || 0,
                    sourceWalletTypes: selected,
                  },
                });
              }}
            />
            <MultiSelectField
              label="DESTINATION WALLET TYPES"
              values={definition.route.destinationWalletTypes.map(String)}
              options={walletTypes
                .filter((wallet) => wallet.status !== false)
                .map((wallet) => ({
                  value: String(wallet.walletId),
                  label: wallet.walletName,
                  detail: wallet.walletDetails,
                }))}
              placeholder="Any destination wallet"
              noun="destination wallet"
              helper="Leave empty to allow any active destination wallet."
              disabled={disabled}
              onChange={(selectedValues) => {
                const selected = selectedValues.map(Number);
                onChange({
                  ...definition,
                  route: {
                    ...definition.route,
                    destinationWalletType: selected[0],
                    destinationWalletTypes: selected,
                  },
                });
              }}
            />
          </>
        )}
        {node === 'condition' && (
          <>
            <div className={styles.conditionMode}>
              <GitBranch />
              <div>
                <span>INDEPENDENT CONDITIONS</span>
                <strong>CHARGE AND COMMISSION ARE SEPARATE</strong>
              </div>
            </div>
            <div className={styles.branchPreview}>
              <GitBranch />
              <span>
                <strong>CHARGE</strong>{' '}
                {definition.charge.enabled
                  ? `${definition.charge.mode} / ${definition.charge.ranges.length} stored ranges`
                  : 'Disabled'}
              </span>
              <span>
                <strong>COMMISSION</strong>{' '}
                {definition.commission.enabled
                  ? `${definition.commission.mode} / ${definition.commission.ranges.length} stored ranges`
                  : 'Disabled'}
              </span>
            </div>
            <p className={styles.nodeHelp}>
              Select the Charge Condition or Commission Condition on the canvas to
              configure its independent mode and ranges.
            </p>
          </>
        )}
        {node === 'charge' && (
          <>
            <label className={styles.toggleRow}>
              <div>
                <strong>CHARGE ENABLED</strong>
                <span>Apply a transaction charge for this service.</span>
              </div>
              <input
                type="checkbox"
                disabled={disabled}
                checked={definition.charge.enabled}
                onChange={(event) =>
                  onChange({
                    ...definition,
                    charge: {
                      ...definition.charge,
                      enabled: event.target.checked,
                    },
                  })
                }
              />
            </label>
            <Field label="CHARGE AMOUNT CONDITION">
              <select
                disabled={disabled || !definition.charge.enabled}
                value={definition.charge.mode}
                onChange={(event) => {
                  const mode = event.target.value as 'FIXED' | 'FLEXIBLE';
                  onChange({
                    ...definition,
                    charge: {
                      ...definition.charge,
                      mode,
                      ranges:
                        mode === 'FLEXIBLE' && !definition.charge.ranges.length
                          ? [
                              {
                                id: `charge-range-${Date.now()}`,
                                minimumAmount: 0,
                                maximumAmount: 10000000,
                                chargeCalculationId:
                                  definition.charge.defaultCalculationId,
                              },
                            ]
                          : definition.charge.ranges,
                    },
                  });
                }}
              >
                <option value="FIXED">Fixed — bypass charge ranges</option>
                <option value="FLEXIBLE">Flexible — use charge ranges</option>
              </select>
            </Field>
            <div className={styles.connectionSummary}>
              <GitCommitHorizontal />
              <div>
                <strong>{definition.charge.mode} CONDITION CONNECTION</strong>
                <span>
                  {definition.charge.mode === 'FIXED'
                    ? 'The direct/default calculation is used.'
                    : 'Ranges may share a calculation or connect one-to-one.'}
                </span>
              </div>
            </div>
            {definition.charge.mode === 'FLEXIBLE' &&
              definition.charge.ranges[selectedRangeIndex] && (
                <div className={styles.editingConnection}>
                  <GitBranch />
                  <div>
                    <span>
                      EDITING RANGE {String(selectedRangeIndex + 1).padStart(2, '0')}
                    </span>
                    <strong>
                      {
                        definition.charge.calculations.find(
                          (calculation) =>
                            calculation.id ===
                            definition.charge.ranges[selectedRangeIndex]
                              .chargeCalculationId,
                        )?.name
                      }
                    </strong>
                  </div>
                </div>
              )}
            <Field label="CHARGE PAYER">
              <select
                disabled={disabled || !definition.charge.enabled}
                value={definition.charge.payer}
                onChange={(event) =>
                  onChange({
                    ...definition,
                    charge: {
                      ...definition.charge,
                      payer: event.target.value as 'S' | 'D',
                    },
                  })
                }
              >
                <option value="S">Source wallet</option>
                <option value="D">Destination wallet</option>
              </select>
            </Field>
            <ReusableCalculationEditor
              label="CHARGE"
              disabled={disabled || !definition.charge.enabled}
              calculations={definition.charge.calculations}
              defaultCalculationId={definition.charge.defaultCalculationId}
              selectedCalculationId={activeChargeCalculationId}
              onSelect={onSelectedChargeCalculationId}
              onChange={(calculations, defaultCalculationId) => {
                const selected =
                  calculations.find(
                    (calculation) => calculation.id === defaultCalculationId,
                  ) || calculations[0];
                onChange({
                  ...definition,
                  charge: {
                    ...definition.charge,
                    ...selected,
                    calculations,
                    defaultCalculationId,
                  },
                });
              }}
            />
            {definition.charge.mode === 'FLEXIBLE' && (
                <FlexibleRangeEditor
                  disabled={disabled}
                  ranges={definition.charge.ranges}
                  chargeCalculations={definition.charge.calculations}
                  selectedIndex={selectedRangeIndex}
                  onSelect={onSelectedRangeIndex}
                  onChargeCalculationSelect={onSelectedChargeCalculationId}
                  onChange={(ranges) =>
                    onChange({
                      ...definition,
                      charge: { ...definition.charge, ranges },
                    })
                  }
                />
            )}
          </>
        )}
        {node === 'commission' && (
          <>
            <div className={styles.directCommissionNote}>
              <Split />
              <div>
                <strong>
                  {definition.commission.mode} COMMISSION CONDITION
                </strong>
                <span>
                  {definition.commission.mode === 'FIXED'
                    ? 'Direct commission calculation with no amount ranges.'
                    : 'Commission uses its own ranges, independent from charge.'}
                </span>
              </div>
            </div>
            <label className={styles.toggleRow}>
              <div>
                <strong>COMMISSION ENABLED</strong>
                <span>Allocate revenue from this transaction.</span>
              </div>
              <input
                type="checkbox"
                disabled={disabled}
                checked={definition.commission.enabled}
                onChange={(event) =>
                  onChange({
                    ...definition,
                    commission: { ...definition.commission, enabled: event.target.checked },
                  })
                }
              />
            </label>
            <Field label="COMMISSION AMOUNT CONDITION">
              <select
                disabled={disabled || !definition.commission.enabled}
                value={definition.commission.mode}
                onChange={(event) => {
                  const mode = event.target.value as 'FIXED' | 'FLEXIBLE';
                  onChange({
                    ...definition,
                    commission: {
                      ...definition.commission,
                      mode,
                      ranges:
                        mode === 'FLEXIBLE' &&
                        !definition.commission.ranges.length
                          ? [
                              {
                                id: `commission-range-${Date.now()}`,
                                minimumAmount: 0,
                                maximumAmount: 10000000,
                                commissionCalculationId:
                                  definition.commission.defaultCalculationId,
                              },
                            ]
                          : definition.commission.ranges,
                    },
                  });
                }}
              >
                <option value="FIXED">Fixed — bypass commission ranges</option>
                <option value="FLEXIBLE">Flexible — use commission ranges</option>
              </select>
            </Field>
            <Field label="COMMISSION RECEIVER">
              <select
                disabled={disabled || !definition.commission.enabled}
                value={definition.commission.receiver}
                onChange={(event) =>
                  onChange({
                    ...definition,
                    commission: {
                      ...definition.commission,
                      receiver: event.target.value as 'S' | 'D',
                    },
                  })
                }
              >
                <option value="S">Source wallet</option>
                <option value="D">Destination wallet</option>
              </select>
            </Field>
            <ReusableCalculationEditor
              label="COMMISSION"
              disabled={disabled || !definition.commission.enabled}
              calculations={definition.commission.calculations}
              defaultCalculationId={definition.commission.defaultCalculationId}
              selectedCalculationId={activeCommissionCalculationId}
              onSelect={onSelectedCommissionCalculationId}
              onChange={(calculations, defaultCalculationId) => {
                const selected =
                  calculations.find(
                    (calculation) => calculation.id === defaultCalculationId,
                  ) || calculations[0];
                onChange({
                  ...definition,
                  commission: {
                    ...definition.commission,
                    ...selected,
                    calculations,
                    defaultCalculationId,
                  },
                });
              }}
            />
            {definition.commission.mode === 'FLEXIBLE' && (
              <CommissionRangeEditor
                disabled={disabled || !definition.commission.enabled}
                ranges={definition.commission.ranges}
                calculations={definition.commission.calculations}
                selectedIndex={selectedCommissionRangeIndex}
                onSelect={onSelectedCommissionRangeIndex}
                onCalculationSelect={onSelectedCommissionCalculationId}
                onChange={(ranges) =>
                  onChange({
                    ...definition,
                    commission: { ...definition.commission, ranges },
                  })
                }
              />
            )}
          </>
        )}
        {node === 'settlement' && (
          <>
            <div className={styles.connectionSummary}>
              <Landmark />
              <div>
                <strong>
                  {selectedSettlementLane.toUpperCase()} SETTLEMENT
                </strong>
                <span>
                  This settlement belongs only to the{' '}
                  {selectedSettlementLane} pricing lane.
                </span>
              </div>
            </div>
            {selectedSettlementLane === 'charge' ? (
              <Field label="CHARGE REVENUE WALLET TYPE">
                <select
                  disabled={disabled || !definition.charge.enabled}
                  value={definition.settlement.chargeWalletType}
                  onChange={(event) =>
                    onChange({
                      ...definition,
                      settlement: {
                        ...definition.settlement,
                        chargeWalletType: number(event.target.value),
                      },
                    })
                  }
                >
                  {!walletTypes.some(
                    (wallet) =>
                      wallet.walletId ===
                      definition.settlement.chargeWalletType,
                  ) && (
                    <option value={definition.settlement.chargeWalletType}>
                      Wallet type {definition.settlement.chargeWalletType}
                    </option>
                  )}
                  {walletTypes
                    .filter((wallet) => wallet.status !== false)
                    .map((wallet) => (
                      <option key={wallet.walletId} value={wallet.walletId}>
                        {wallet.walletName}
                      </option>
                    ))}
                </select>
              </Field>
            ) : (
              <Field label="COMMISSION FUNDING WALLET TYPE">
                <select
                  disabled={disabled || !definition.commission.enabled}
                  value={definition.settlement.commissionWalletType}
                  onChange={(event) =>
                    onChange({
                      ...definition,
                      settlement: {
                        ...definition.settlement,
                        commissionWalletType: number(event.target.value),
                      },
                    })
                  }
                >
                  {!walletTypes.some(
                    (wallet) =>
                      wallet.walletId ===
                      definition.settlement.commissionWalletType,
                  ) && (
                    <option value={definition.settlement.commissionWalletType}>
                      Wallet type {definition.settlement.commissionWalletType}
                    </option>
                  )}
                  {walletTypes
                    .filter((wallet) => wallet.status !== false)
                    .map((wallet) => (
                      <option key={wallet.walletId} value={wallet.walletId}>
                        {wallet.walletName}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <div className={styles.settlementMap}>
              <WalletCards />
              {selectedSettlementLane === 'charge' ? (
                <>
                  <span>Charge revenue settlement</span>
                  <span>
                    Credit{' '}
                    {walletTypes.find(
                      (wallet) =>
                        wallet.walletId ===
                        definition.settlement.chargeWalletType,
                    )?.walletName || 'unknown wallet'}
                  </span>
                </>
              ) : (
                <>
                  <span>Commission funding settlement</span>
                  <span>
                    Debit{' '}
                    {walletTypes.find(
                      (wallet) =>
                        wallet.walletId ===
                        definition.settlement.commissionWalletType,
                    )?.walletName || 'unknown wallet'}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className={styles.inspectorFoot}>
        <ShieldCheck />
        <span>Changes require maker-checker approval before runtime activation.</span>
      </div>
    </>
  );
}

function MoneyRuleEditor({
  label,
  rule,
  partyLabel,
  hideParty = false,
  disabled,
  onChange,
}: {
  label: string;
  rule: {
    type: 'FIXED' | 'PERCENTAGE';
    value: number;
    minimum?: number;
    maximum?: number;
    payer?: 'S' | 'D';
    receiver?: 'S' | 'D';
    enabled?: boolean;
  };
  partyLabel: string;
  hideParty?: boolean;
  disabled: boolean;
  onChange: (next: {
    type: 'FIXED' | 'PERCENTAGE';
    value: number;
    minimum?: number;
    maximum?: number;
    payer?: 'S' | 'D';
    receiver?: 'S' | 'D';
    enabled?: boolean;
  }) => void;
}) {
  const party = rule.payer || rule.receiver || 'S';
  const update = (patch: Record<string, unknown>) => onChange({ ...rule, ...patch } as typeof rule);
  return (
    <>
      <Field label={`${label} METHOD`}>
        <select
          disabled={disabled}
          value={rule.type}
          onChange={(event) => update({ type: event.target.value })}
        >
          <option value="FIXED">Fixed amount</option>
          <option value="PERCENTAGE">Percentage</option>
        </select>
      </Field>
      <Field label={rule.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED AMOUNT'}>
        <input
          disabled={disabled}
          inputMode="decimal"
          value={rule.value}
          onChange={(event) => update({ value: Number(event.target.value) || 0 })}
        />
      </Field>
      <div className={styles.twoFields}>
        <Field label="MINIMUM">
          <input
            disabled={disabled}
            inputMode="decimal"
            value={rule.minimum ?? ''}
            placeholder="None"
            onChange={(event) =>
              update({ minimum: event.target.value === '' ? undefined : Number(event.target.value) })
            }
          />
        </Field>
        <Field label="MAXIMUM">
          <input
            disabled={disabled}
            inputMode="decimal"
            value={rule.maximum ?? ''}
            placeholder="None"
            onChange={(event) =>
              update({ maximum: event.target.value === '' ? undefined : Number(event.target.value) })
            }
          />
        </Field>
      </div>
      {!hideParty && (
        <Field label={partyLabel}>
          <select
            disabled={disabled}
            value={party}
            onChange={(event) =>
              update({ [rule.payer !== undefined ? 'payer' : 'receiver']: event.target.value })
            }
          >
            <option value="S">Source wallet</option>
            <option value="D">Destination wallet</option>
          </select>
        </Field>
      )}
    </>
  );
}

function ReusableCalculationEditor({
  label,
  calculations,
  defaultCalculationId,
  selectedCalculationId,
  disabled,
  onSelect,
  onChange,
}: {
  label: 'CHARGE' | 'COMMISSION';
  calculations: PricingFlowDefinition['charge']['calculations'];
  defaultCalculationId: string;
  selectedCalculationId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onChange: (
    calculations: PricingFlowDefinition['charge']['calculations'],
    defaultCalculationId: string,
  ) => void;
}) {
  const selected =
    calculations.find((calculation) => calculation.id === selectedCalculationId) ||
    calculations[0];
  const updateSelected = (
    patch: Partial<PricingFlowDefinition['charge']['calculations'][number]>,
  ) => {
    onChange(
      calculations.map((calculation) =>
        calculation.id === selected.id ? { ...calculation, ...patch } : calculation,
      ),
      defaultCalculationId,
    );
  };
  const add = () => {
    const id = `${label.toLowerCase()}-calculation-${Date.now()}`;
    const next = [
      ...calculations,
      {
        id,
        name: `${label === 'CHARGE' ? 'Charge' : 'Commission'} calculation ${
          calculations.length + 1
        }`,
        type: 'FIXED' as const,
        value: 0,
      },
    ];
    onChange(next, defaultCalculationId || id);
    onSelect(id);
  };
  return (
    <div className={styles.calculationLibrary}>
      <div className={styles.rangeEditorHead}>
        <div>
          <span>REUSABLE {label} CALCULATIONS</span>
          <strong>{calculations.length} AVAILABLE</strong>
        </div>
        <button disabled={disabled} onClick={add}><Plus /> Add calculation</button>
      </div>
      <Field label="EDIT CALCULATION">
        <select
          disabled={disabled}
          value={selected.id}
          onChange={(event) => onSelect(event.target.value)}
        >
          {calculations.map((calculation) => (
            <option key={calculation.id} value={calculation.id}>
              {calculation.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="CALCULATION NAME">
        <input
          disabled={disabled}
          value={selected.name}
          onChange={(event) => updateSelected({ name: event.target.value })}
        />
      </Field>
      <label className={styles.defaultCalculation}>
        <input
          type="radio"
          disabled={disabled}
          checked={defaultCalculationId === selected.id}
          onChange={() => onChange(calculations, selected.id)}
        />
        <span>Use as direct/default calculation</span>
      </label>
      <MoneyRuleEditor
        label={label}
        disabled={disabled}
        rule={selected}
        partyLabel="INTERNAL"
        hideParty
        onChange={(next) => updateSelected(next)}
      />
    </div>
  );
}

function FlexibleRangeEditor({
  ranges,
  disabled,
  chargeCalculations,
  selectedIndex,
  onSelect,
  onChargeCalculationSelect,
  onChange,
}: {
  ranges: PricingFlowDefinition['charge']['ranges'];
  disabled: boolean;
  chargeCalculations: PricingFlowDefinition['charge']['calculations'];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onChargeCalculationSelect: (id: string) => void;
  onChange: (ranges: PricingFlowDefinition['charge']['ranges']) => void;
}) {
  const update = (
    index: number,
    patch: Partial<PricingFlowDefinition['charge']['ranges'][number]>,
  ) => {
    onChange(ranges.map((range, rangeIndex) =>
      rangeIndex === index ? { ...range, ...patch } : range));
  };
  const add = () => {
    const previous = ranges[ranges.length - 1];
    const minimumAmount = previous?.maximumAmount === undefined
      ? 0
      : Number((previous.maximumAmount + 0.01).toFixed(2));
    onChange([
      ...ranges,
      {
        id: `amount-range-${Date.now()}`,
        minimumAmount,
        maximumAmount: minimumAmount + 100000,
        chargeCalculationId: chargeCalculations[0].id,
      },
    ]);
    onSelect(ranges.length);
    onChargeCalculationSelect(chargeCalculations[0].id);
  };
  return (
    <div className={styles.rangeEditor}>
      <div className={styles.rangeEditorHead}>
        <div>
          <span>AMOUNT RANGES</span>
          <strong>{ranges.length} CONFIGURED</strong>
        </div>
        <button disabled={disabled} onClick={add}><Plus /> Add range</button>
      </div>
      {ranges.map((range, index) => (
        <div
          className={`${styles.rangeCard} ${
            selectedIndex === index ? styles.selectedRangeCard : ''
          }`}
          key={`${range.minimumAmount}-${index}`}
          onClick={() => {
            onSelect(index);
            onChargeCalculationSelect(range.chargeCalculationId);
          }}
        >
          <div className={styles.rangeCardHead}>
            <span>RANGE {String(index + 1).padStart(2, '0')}</span>
            <button
              disabled={disabled || ranges.length === 1}
              onClick={(event) => {
                event.stopPropagation();
                const nextRanges = ranges.filter((_, rangeIndex) => rangeIndex !== index);
                const nextIndex = Math.max(0, Math.min(selectedIndex, ranges.length - 2));
                onChange(nextRanges);
                onSelect(nextIndex);
                onChargeCalculationSelect(nextRanges[nextIndex].chargeCalculationId);
              }}
              aria-label={`Remove range ${index + 1}`}
            >
              <X />
            </button>
          </div>
          <div className={styles.twoFields}>
            <Field label="FROM AMOUNT">
              <input
                disabled={disabled}
                inputMode="decimal"
                value={range.minimumAmount}
                onChange={(event) => update(index, { minimumAmount: Number(event.target.value) || 0 })}
              />
            </Field>
            <Field label="TO AMOUNT">
              <input
                disabled={disabled}
                inputMode="decimal"
                value={range.maximumAmount ?? ''}
                placeholder="No cap"
                onChange={(event) => update(index, {
                  maximumAmount: event.target.value === '' ? undefined : Number(event.target.value),
                })}
              />
            </Field>
          </div>
          <Field label="CHARGE CALCULATION CONNECTION">
            <select
              disabled={disabled}
              value={range.chargeCalculationId}
              onChange={(event) => {
                update(index, { chargeCalculationId: event.target.value });
                onChargeCalculationSelect(event.target.value);
              }}
            >
              {chargeCalculations.map((calculation) => (
                <option key={calculation.id} value={calculation.id}>
                  {calculation.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ))}
    </div>
  );
}

function CommissionRangeEditor({
  ranges,
  calculations,
  disabled,
  selectedIndex,
  onSelect,
  onCalculationSelect,
  onChange,
}: {
  ranges: PricingFlowDefinition['commission']['ranges'];
  calculations: PricingFlowDefinition['commission']['calculations'];
  disabled: boolean;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCalculationSelect: (id: string) => void;
  onChange: (ranges: PricingFlowDefinition['commission']['ranges']) => void;
}) {
  const update = (
    index: number,
    patch: Partial<PricingFlowDefinition['commission']['ranges'][number]>,
  ) => {
    onChange(
      ranges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, ...patch } : range,
      ),
    );
  };
  const add = () => {
    const previous = ranges[ranges.length - 1];
    const minimumAmount =
      previous?.maximumAmount === undefined
        ? 0
        : Number((previous.maximumAmount + 0.01).toFixed(2));
    onChange([
      ...ranges,
      {
        id: `commission-range-${Date.now()}`,
        minimumAmount,
        maximumAmount: minimumAmount + 100000,
        commissionCalculationId: calculations[0].id,
      },
    ]);
    onSelect(ranges.length);
    onCalculationSelect(calculations[0].id);
  };
  return (
    <div className={styles.rangeEditor}>
      <div className={styles.rangeEditorHead}>
        <div>
          <span>COMMISSION AMOUNT RANGES</span>
          <strong>{ranges.length} CONFIGURED</strong>
        </div>
        <button disabled={disabled} onClick={add}>
          <Plus /> Add range
        </button>
      </div>
      {ranges.map((range, index) => (
        <div
          className={`${styles.rangeCard} ${
            selectedIndex === index ? styles.selectedRangeCard : ''
          }`}
          key={range.id}
          onClick={() => {
            onSelect(index);
            onCalculationSelect(range.commissionCalculationId);
          }}
        >
          <div className={styles.rangeCardHead}>
            <span>COMMISSION RANGE {String(index + 1).padStart(2, '0')}</span>
            <button
              disabled={disabled || ranges.length === 1}
              onClick={(event) => {
                event.stopPropagation();
                const nextRanges = ranges.filter(
                  (_, rangeIndex) => rangeIndex !== index,
                );
                const nextIndex = Math.max(
                  0,
                  Math.min(selectedIndex, ranges.length - 2),
                );
                onChange(nextRanges);
                onSelect(nextIndex);
                onCalculationSelect(
                  nextRanges[nextIndex].commissionCalculationId,
                );
              }}
              aria-label={`Remove commission range ${index + 1}`}
            >
              <X />
            </button>
          </div>
          <div className={styles.twoFields}>
            <Field label="FROM AMOUNT">
              <input
                disabled={disabled}
                inputMode="decimal"
                value={range.minimumAmount}
                onChange={(event) =>
                  update(index, {
                    minimumAmount: Number(event.target.value) || 0,
                  })
                }
              />
            </Field>
            <Field label="TO AMOUNT">
              <input
                disabled={disabled}
                inputMode="decimal"
                value={range.maximumAmount ?? ''}
                placeholder="No cap"
                onChange={(event) =>
                  update(index, {
                    maximumAmount:
                      event.target.value === ''
                        ? undefined
                        : Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
          <Field label="COMMISSION CALCULATION CONNECTION">
            <select
              disabled={disabled}
              value={range.commissionCalculationId}
              onChange={(event) => {
                update(index, {
                  commissionCalculationId: event.target.value,
                });
                onCalculationSelect(event.target.value);
              }}
            >
              {calculations.map((calculation) => (
                <option key={calculation.id} value={calculation.id}>
                  {calculation.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ))}
    </div>
  );
}

function ManualEditor({
  definition,
  disabled,
  onChange,
}: {
  definition: PricingFlowDefinition;
  disabled: boolean;
  onChange: (next: PricingFlowDefinition) => void;
}) {
  const rows: Array<[string, string, string | number, string]> = [
    ['Trigger', 'Keywords', definition.trigger.keywords.join(', '), 'trigger.keywords'],
    ['Trigger', 'Currency', definition.trigger.currency, 'trigger.currency'],
    ['Wallet route', 'Source wallet types', definition.route.sourceWalletTypes.join(', '), 'route.sourceWalletTypes'],
    ['Wallet route', 'Destination wallet types', definition.route.destinationWalletTypes.join(', '), 'route.destinationWalletTypes'],
    ['Condition', 'Minimum amount', definition.condition.minimumAmount, 'condition.minimumAmount'],
    ['Condition', 'Maximum amount', definition.condition.maximumAmount ?? '', 'condition.maximumAmount'],
    ['Charge', 'Enabled', definition.charge.enabled ? 'TRUE' : 'FALSE', 'charge.enabled'],
    ['Charge', 'Mode', definition.charge.mode, 'charge.mode'],
    ['Charge', 'Calculation type', definition.charge.type, 'charge.type'],
    ['Charge', 'Value', definition.charge.value, 'charge.value'],
    ['Charge', 'Payer', definition.charge.payer, 'charge.payer'],
    ['Charge', 'Default calculation', definition.charge.defaultCalculationId, 'charge.defaultCalculationId'],
    ['Commission', 'Enabled', definition.commission.enabled ? 'TRUE' : 'FALSE', 'commission.enabled'],
    ['Commission', 'Mode', definition.commission.mode, 'commission.mode'],
    ['Commission', 'Calculation type', definition.commission.type, 'commission.type'],
    ['Commission', 'Value', definition.commission.value, 'commission.value'],
    ['Commission', 'Receiver', definition.commission.receiver, 'commission.receiver'],
    ['Commission', 'Default calculation', definition.commission.defaultCalculationId, 'commission.defaultCalculationId'],
    ['Settlement', 'Charge wallet', definition.settlement.chargeWalletType, 'settlement.chargeWalletType'],
    ['Settlement', 'Commission wallet', definition.settlement.commissionWalletType, 'settlement.commissionWalletType'],
    ...definition.charge.ranges.flatMap((range, index) => [
      [`Range ${index + 1}`, 'From amount', range.minimumAmount, `charge.ranges.${index}.minimumAmount`],
      [`Range ${index + 1}`, 'To amount', range.maximumAmount ?? '', `charge.ranges.${index}.maximumAmount`],
      [`Range ${index + 1}`, 'Charge calculation', range.chargeCalculationId, `charge.ranges.${index}.chargeCalculationId`],
    ] as Array<[string, string, string | number, string]>),
    ...definition.commission.ranges.flatMap((range, index) => [
      [`Commission range ${index + 1}`, 'From amount', range.minimumAmount, `commission.ranges.${index}.minimumAmount`],
      [`Commission range ${index + 1}`, 'To amount', range.maximumAmount ?? '', `commission.ranges.${index}.maximumAmount`],
      [`Commission range ${index + 1}`, 'Commission calculation', range.commissionCalculationId, `commission.ranges.${index}.commissionCalculationId`],
    ] as Array<[string, string, string | number, string]>),
    ...definition.charge.calculations.flatMap((calculation, index) => [
      [`Charge calc ${index + 1}`, 'Name', calculation.name, `charge.calculations.${index}.name`],
      [`Charge calc ${index + 1}`, 'Type', calculation.type, `charge.calculations.${index}.type`],
      [`Charge calc ${index + 1}`, 'Value', calculation.value, `charge.calculations.${index}.value`],
    ] as Array<[string, string, string | number, string]>),
    ...definition.commission.calculations.flatMap((calculation, index) => [
      [`Commission calc ${index + 1}`, 'Name', calculation.name, `commission.calculations.${index}.name`],
      [`Commission calc ${index + 1}`, 'Type', calculation.type, `commission.calculations.${index}.type`],
      [`Commission calc ${index + 1}`, 'Value', calculation.value, `commission.calculations.${index}.value`],
    ] as Array<[string, string, string | number, string]>),
  ];
  const updatePath = (path: string, value: string) => {
    if (path === 'trigger.keywords') {
      const keywords = [
        ...new Set(
          value
            .split(',')
            .map((keyword) => keyword.trim().toUpperCase())
            .filter(Boolean),
        ),
      ];
      onChange({
        ...definition,
        trigger: {
          ...definition.trigger,
          keyword: keywords[0] || '',
          keywords,
        },
      });
      return;
    }
    if (
      path === 'route.sourceWalletTypes' ||
      path === 'route.destinationWalletTypes'
    ) {
      const walletTypes = [
        ...new Set(
          value
            .split(',')
            .map((walletType) => Number(walletType.trim()))
            .filter((walletType) => Number.isInteger(walletType) && walletType > 0),
        ),
      ];
      const isSource = path === 'route.sourceWalletTypes';
      onChange({
        ...definition,
        route: {
          ...definition.route,
          ...(isSource
            ? {
                sourceWalletType: walletTypes[0] || 0,
                sourceWalletTypes: walletTypes,
              }
            : {
                destinationWalletType: walletTypes[0],
                destinationWalletTypes: walletTypes,
              }),
        },
      });
      return;
    }
    const segments = path.split('.');
    const key = segments[segments.length - 1];
    const stringFields = [
      'keyword',
      'currency',
      'type',
      'payer',
      'receiver',
      'mode',
      'name',
      'defaultCalculationId',
      'chargeCalculationId',
      'commissionCalculationId',
      'enabled',
    ];
    const nextValue = key === 'enabled'
      ? value.toUpperCase() === 'TRUE'
      : stringFields.includes(key)
        ? value.toUpperCase()
      : value === ''
        ? undefined
        : Number(value);
    const next = JSON.parse(JSON.stringify(definition)) as Record<string, unknown>;
    let target = next;
    segments.slice(0, -1).forEach((segment) => {
      target = target[segment] as Record<string, unknown>;
    });
    target[key] = nextValue;
    onChange(next as PricingFlowDefinition);
  };
  return (
    <section className={styles.manualEditor}>
      <div className={styles.panelHead}>
        <div>
          <span>OPERATIONS / DIRECT EDIT</span>
          <strong>Manual pricing fields</strong>
        </div>
        <span className={styles.schemaChip}>SAME FLOW CONTRACT</span>
      </div>
      <table>
        <thead><tr><th>NODE</th><th>FIELD</th><th>VALUE</th><th>CONTRACT PATH</th></tr></thead>
        <tbody>
          {rows.map(([node, field, value, path]) => (
            <tr key={path}>
              <td><span className={styles.tableNode}>{node}</span></td>
              <td>{field}</td>
              <td>
                <input
                  disabled={disabled}
                  value={value}
                  onChange={(event) => updatePath(path, event.target.value)}
                />
              </td>
              <td><code>{path}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SimulationConsole({
  definition,
  walletTypes,
  amount,
  sourceWalletType,
  destinationWalletType,
  simulation,
  busy,
  onAmount,
  onSourceWalletType,
  onDestinationWalletType,
  onSimulate,
}: {
  definition: PricingFlowDefinition;
  walletTypes: WalletTypeOption[];
  amount: string;
  sourceWalletType: string;
  destinationWalletType: string;
  simulation: PricingSimulation | null;
  busy: boolean;
  onAmount: (value: string) => void;
  onSourceWalletType: (value: string) => void;
  onDestinationWalletType: (value: string) => void;
  onSimulate: () => void;
}) {
  const activeWallets = walletTypes.filter((wallet) => wallet.status !== false);
  return (
    <section className={styles.simulator}>
      <div className={styles.simulatorInput}>
        <span><Play /> LIVE SIMULATION</span>
        <label>
          SOURCE WALLET
          <select
            value={sourceWalletType}
            onChange={(event) => onSourceWalletType(event.target.value)}
          >
            <option value="">Select source wallet</option>
            {activeWallets.map((wallet) => (
              <option key={wallet.walletId} value={wallet.walletId}>
                {wallet.walletName}
              </option>
            ))}
          </select>
        </label>
        <label>
          DESTINATION WALLET
          <select
            value={destinationWalletType}
            onChange={(event) => onDestinationWalletType(event.target.value)}
          >
            <option value="">Select destination wallet</option>
            {activeWallets.map((wallet) => (
              <option key={wallet.walletId} value={wallet.walletId}>
                {wallet.walletName}
              </option>
            ))}
          </select>
        </label>
        <label>
          TRANSACTION AMOUNT
          <div>
            <small>{definition.trigger.currency}</small>
            <input inputMode="decimal" value={amount} onChange={(event) => onAmount(event.target.value)} />
          </div>
        </label>
        <button className={styles.primaryButton} onClick={onSimulate} disabled={busy}>
          {busy ? <LoaderCircle className={styles.spin} /> : <Play />} Run flow
        </button>
      </div>
      <div className={styles.simulatorResults}>
        <Result
          label="ROUTE CHECK"
          value={
            simulation
              ? simulation.routeMatched
                ? 'CONFIRMED'
                : 'REJECTED'
              : '—'
          }
          accent={simulation?.routeMatched ? 'green' : undefined}
        />
        <Result label="CUSTOMER AMOUNT" value={simulation?.transactionAmount || '—'} />
        <Result label="CHARGE" value={simulation?.chargeAmount || '—'} accent="green" />
        <Result label="COMMISSION" value={simulation?.commissionAmount || '—'} accent="violet" />
        <Result label="SOURCE DEBIT" value={simulation?.sourceDebitAmount || '—'} />
        <Result label="DESTINATION CREDIT" value={simulation?.destinationCreditAmount || '—'} />
      </div>
      <div className={styles.trace}>
        {simulation ? (
          simulation.trace.map((item, index) => (
            <div key={item.node} className={styles[`trace${item.status}`]}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><strong>{item.node.replace('_', ' ')}</strong><small>{item.detail}</small></div>
              <i>{item.status}</i>
            </div>
          ))
        ) : (
          <div className={styles.emptyTrace}>
            <Activity />
            <span>Run a sample transaction to illuminate the execution path.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Result({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'violet';
}) {
  return (
    <div className={accent ? styles[accent] : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MultiSelectField({
  label,
  values,
  options,
  placeholder,
  noun,
  helper,
  disabled,
  onChange,
}: {
  label: string;
  values: string[];
  options: Array<{ value: string; label: string; detail?: string }>;
  placeholder: string;
  noun: string;
  helper: string;
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement | null>(null);
  const selectedOptions = values.map(
    (value) =>
      options.find((option) => option.value === value) || {
        value,
        label: 'Unavailable selection',
      },
  );
  const availableOptions = options.filter((option) => {
    const searchText = `${option.label} ${option.detail || ''}`.toLowerCase();
    return searchText.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      values.includes(value)
        ? values.filter((selected) => selected !== value)
        : [...values, value],
    );
  };

  return (
    <div className={styles.field}>
      <span>{label}</span>
      <div
        ref={root}
        className={`${styles.multiSelect} ${open ? styles.multiSelectOpen : ''}`}
      >
        <button
          type="button"
          className={styles.multiSelectTrigger}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <span>
            {values.length
              ? `${values.length} ${noun}${values.length === 1 ? '' : 's'} selected`
              : placeholder}
          </span>
          <ChevronDown />
        </button>
        {open && !disabled && (
          <div className={styles.multiSelectMenu}>
            <div className={styles.multiSelectSearch}>
              <Search />
              <input
                autoFocus
                value={query}
                aria-label={`Search ${noun}s`}
                placeholder={`Search ${noun}s`}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div
              className={styles.multiSelectOptions}
              role="listbox"
              aria-multiselectable="true"
            >
              {availableOptions.length ? (
                availableOptions.map((option) => {
                  const selected = values.includes(option.value);
                  return (
                    <button
                      type="button"
                      key={option.value}
                      role="option"
                      aria-selected={selected}
                      className={selected ? styles.multiSelectOptionSelected : ''}
                      onClick={() => toggle(option.value)}
                    >
                      <i>{selected && <Check />}</i>
                      <span>
                        <strong>{option.label}</strong>
                        {option.detail && <small>{option.detail}</small>}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className={styles.multiSelectEmpty}>No matching records</div>
              )}
            </div>
          </div>
        )}
      </div>
      {selectedOptions.length > 0 && (
        <div className={styles.selectedChips}>
          {selectedOptions.map((option) => (
            <span key={option.value}>
              {option.label}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${option.label}`}
                onClick={() => toggle(option.value)}
              >
                <X />
              </button>
            </span>
          ))}
        </div>
      )}
      <small className={styles.multiSelectHelper}>{helper}</small>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}
