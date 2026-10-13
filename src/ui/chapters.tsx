import React, { useSyncExternalStore } from 'react';
import { ASSEMBLY, CLOSE, CODE, COMPOSE, HERO, PARAMS, SELECT, SIM, VERIFY } from '../content';
import { BldcIndex, FieldIndex, FilletError, FlangeIndex, FourbarIndex, useJson } from '../data';
import { CadDoc } from '../gl/cad';
import { showcase } from '../gl/stages/showcase';
import { LOAD_CASE_TAGS, exaggeration } from '../gl/stages/sim';
import { useChapterStep } from '../scroll';
import { DOCS_URL, FEM_RAMP, GITHUB_URL, PAPER_URL, PYPI_URL } from '../style/tokens';
import {
  COMPOSE_LINKS,
  codeStage,
  composeActive,
  explode,
  paramsStep,
  selectStep,
  simDeform,
  simField,
  verifyPhase,
} from '../timelines';
import { Chapter, Code, CodeLine, Copy, Heading, Install, Panel, PromptCopy, fmt } from './common';

/** scroll progress of a chapter at 0.25 % resolution */
const useProgress = (id: Parameters<typeof useChapterStep>[0]) => useChapterStep(id, 400) / 400;

// ---------------------------------------------------------------------------- 00 hero

const useShowcase = () => useSyncExternalStore(showcase.subscribe, () => showcase.version);

export const Hero: React.FC = () => {
  useShowcase();
  const p = showcase.products[showcase.index];
  const foot = (
    <span className="chips">
      {showcase.products.map((x, i) => (
        <button
          key={x.key}
          type="button"
          className={i === showcase.index ? 'on' : ''}
          disabled={!showcase.loaded.has(i)}
          onClick={() => (showcase.request = i)}
        >
          {x.title}
        </button>
      ))}
    </span>
  );
  return (
  <Chapter
    id="hero"
    length={1.5}
    className="hero"
    viewport={{
      label: p ? p.notebook.replace(/^examples\/[^/]+\//, '') : 'loading models',
      right: p ? (p.kind === 'assembly' ? `assembly · ${p.parts} parts` : 'part') : '',
      foot,
    }}
  >
    <Copy id="hero">
      <div className="kicker">
        <span className="chip">2.2</span>
        <span>{HERO.kicker}</span>
      </div>
      <h1 className="title">
        {HERO.lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </h1>
      <p className="body">{HERO.body}</p>
      <PromptCopy prompt={HERO.prompt} label="Paste this to your coding agent" />
      <div className="ctas">
        <Install command={HERO.install} />
        <a className="btn" href={GITHUB_URL} target="_blank" rel="noreferrer">
          View on GitHub
        </a>
      </div>
      <div className="scroll-cue">Scroll — seven ideas, each shown on a real model from the repository</div>
    </Copy>
  </Chapter>
  );
};

// ---------------------------------------------------------------------------- 01 code

/** the flange notebook's six feature cells (examples/flange_plate/flange_plate.py, comments in English) */
const CELLS: { args: string; body: string[] }[] = [
  {
    args: 'FLANGE_OD, FLANGE_T',
    body: [
      'flange_disc = scad.make_cylinder_rsolid(',
      '    radius=FLANGE_OD / 2.0, height=FLANGE_T,',
      '    bottom_face_center=(0.0, 0.0, 0.0))',
    ],
  },
  {
    args: 'BOSS_OD, BOSS_TOP_Z, FLANGE_T, flange_disc',
    body: [
      '_boss = scad.make_cylinder_rsolid(',
      '    radius=BOSS_OD / 2.0,',
      '    height=BOSS_TOP_Z - FLANGE_T,',
      '    bottom_face_center=(0.0, 0.0, FLANGE_T))',
      'center_boss = scad.union_rsolid(flange_disc, _boss)',
    ],
  },
  {
    args: 'BORE_D, BOSS_TOP_Z, center_boss',
    body: [
      '_bore = scad.make_cylinder_rsolid(',
      '    radius=BORE_D / 2.0,',
      '    height=BOSS_TOP_Z + 2.0 * OVERSHOOT,',
      '    bottom_face_center=(0.0, 0.0, -OVERSHOOT))',
      'center_bore = scad.cut_rsolid(center_boss, _bore)',
    ],
  },
  {
    args: 'BOLT_COUNT, BOLT_D, BOLT_PCD, FLANGE_T, ...',
    body: [
      '_proto = scad.make_cylinder_rsolid(',
      '    radius=BOLT_D / 2.0,',
      '    height=FLANGE_T + 2.0 * OVERSHOOT,',
      '    bottom_face_center=(BOLT_PCD / 2.0, 0.0, -OVERSHOOT))',
      '_tools = scad.radial_pattern_rsolidlist(',
      '    shape=_proto, count=int(float(BOLT_COUNT)))',
      'bolt_holes = scad.cut_rsolid(center_bore, _tools)',
    ],
  },
  {
    args: 'BOSS_FILLET_R, BOSS_OD, FLANGE_T, bolt_holes',
    body: [
      '_root = ql.edges().where(ql.and_(',
      '    ql.prop("geom.type", "==", "CIRCLE"),',
      '    ...  # z == FLANGE_T, length == pi * BOSS_OD',
      ')).exactly(1)',
      'boss_root_fillet = scad.fillet_rsolid(',
      '    solid=bolt_holes, edges=_root, radius=BOSS_FILLET_R,',
      '    generated_faces_tag="fillet.boss_root")',
    ],
  },
  {
    args: 'EDGE_FILLET_R, FLANGE_OD, FLANGE_T, ...',
    body: [
      '_rims = ql.edges().where(ql.and_(',
      '    ql.prop("geom.type", "==", "CIRCLE"),',
      '    ...  # length == pi * FLANGE_OD, z in {0, FLANGE_T}',
      ')).exactly(2)',
      'flange_edge_fillets = scad.fillet_rsolid(',
      '    solid=boss_root_fillet, edges=_rims, radius=EDGE_FILLET_R,',
      '    generated_faces_tag="fillet.flange_edge")',
    ],
  },
];

export const CodeChapter: React.FC = () => {
  const idx = useJson<FlangeIndex>('geometry/flange/index.json');
  const p = useProgress('code');
  const k = codeStage(p);
  const lines: CodeLine[] = [];
  CELLS.forEach((c, i) => {
    const s = idx?.stages[i];
    const head = `# ---- feature: ${s?.slug ?? '…'} (${s?.kind ?? '…'}) ----`;
    if (i === k) {
      lines.push({ text: '@app.cell', state: 'on' });
      lines.push({ text: `def _(${c.args}):`, state: 'on' });
      lines.push({ text: `    ${head}`, state: 'hot', ink: 'focus' });
      c.body.forEach((b) => lines.push({ text: `    ${b}`, state: 'on' }));
    } else {
      lines.push({ text: `    ${head}`, state: i < k ? 'on' : 'dim', head: i < k });
    }
  });
  return (
    <Chapter
      id="code"
      length={3}
      viewport={{
        label: `after cell ${k + 1} · ${idx?.stages[k].slug ?? ''}`,
        right: idx ? `${idx.stages[k].faces} faces` : '',
        foot: 'faces the cell created are drawn in focus ink',
      }}
    >
      <Copy id="code">
        <Heading copy={CODE} />
        <Panel head="examples/flange_plate/flange_plate.py" right={`cell ${k + 1} / 6`}>
          <Code lines={lines} />
        </Panel>
        <div className="stdout">
          {idx?.stages.slice(0, k + 1).map((s, i) => (
            <div key={s.slug}>
              {i === k ? <b>[{s.slug}]</b> : `[${s.slug}]`} volume={fmt(s.volume, 3).replace(/,/g, '')} faces={s.faces}
            </div>
          ))}
        </div>
      </Copy>
    </Chapter>
  );
};

// ---------------------------------------------------------------------------- 02 select

const QL_LINES: { text: string; step: number }[] = [
  { text: '_rims = ql.edges().where(ql.and_(', step: 0 },
  { text: '    ql.prop("geom.type", "==", "CIRCLE"),', step: 1 },
  { text: '    ql.prop("geom.length", ">=", math.pi * _od - 0.5),', step: 2 },
  { text: '    ql.prop("geom.length", "<=", math.pi * _od + 0.5),', step: 2 },
  { text: '    ql.or_(', step: 3 },
  { text: '        ql.and_(ql.prop("geom.center.z", ">=", -0.1),', step: 3 },
  { text: '                ql.prop("geom.center.z", "<=", 0.1)),', step: 3 },
  { text: '        ql.and_(ql.prop("geom.center.z", ">=", _t - 0.1),', step: 3 },
  { text: '                ql.prop("geom.center.z", "<=", _t + 0.1))),', step: 3 },
  { text: ')).exactly(2)', step: 3 },
  { text: 'body = scad.fillet_rsolid(solid=body, edges=_rims,', step: 4 },
  { text: '    radius=EDGE_FILLET_R,', step: 4 },
  { text: '    generated_faces_tag="fillet.flange_edge")', step: 4 },
];

export const SelectChapter: React.FC = () => {
  const idx = useJson<FlangeIndex>('geometry/flange/index.json');
  const pre = useJson<CadDoc>('geometry/flange/stage_4.json');
  const post = useJson<CadDoc>('geometry/flange/stage_5.json');
  const s = selectStep(useProgress('select'));
  const od = idx?.params.flange_od ?? 100;
  const edges = pre?.edges ?? [];
  const circles = edges.filter((e) => e.type === 'CIRCLE');
  const rims = circles.filter((e) => Math.abs(e.length - Math.PI * od) <= 0.5);
  const exact = idx?.selections['flange-edge-fillets'].edges.length ?? 0;
  const tagged = post?.faces.filter((f) => f.tags.includes('fillet.flange_edge')).map((f) => f.i) ?? [];
  const counts = [
    { k: 'ql.edges()', n: edges.length },
    { k: 'geom.type == CIRCLE', n: circles.length },
    { k: `geom.length ≈ π·${od}`, n: rims.length },
    { k: 'center.z ∈ {0, t} · exactly(2)', n: exact },
  ];
  const max = Math.max(1, edges.length);
  return (
    <Chapter
      id="select"
      length={3}
      viewport={{
        label: s >= 4 ? 'fillet.flange_edge · tagged faces' : 'QL · resolve on the BRep',
        right: s >= 4 ? `${tagged.length} faces` : `${counts[Math.min(s, 3)].n} edges`,
        foot: 'every count is resolved on the exported model, not drawn by hand',
      }}
    >
      <Copy id="select">
        <Heading copy={SELECT} />
        <Panel head="flange-edge-fillets · QL select" right={s >= 3 ? 'resolved' : 'resolving'}>
          <Code
            lines={QL_LINES.map((l) => ({
              text: l.text,
              state: l.step === s ? 'hot' : l.step < s ? 'on' : 'dim',
              ink: l.step === s ? (s >= 3 ? 'pass' : 'focus') : undefined,
            }))}
          />
        </Panel>
        <div className="readout">
          {counts.map((c, i) => (
            <React.Fragment key={c.k}>
              <span className="k" style={{ color: i <= s ? undefined : '#444' }}>
                {c.k}
              </span>
              <span className={`bar ${i === Math.min(s, 3) ? (s >= 3 ? 'pass' : 'focus') : ''}`} style={{ width: i <= s ? `${(c.n / max) * 100}%` : '0%' }} />
              <span className="v">{i <= s ? String(c.n).padStart(2, '0') : '··'}</span>
            </React.Fragment>
          ))}
          <span className="k" style={{ color: s >= 4 ? 'var(--focus)' : '#444' }}>
            faces(tag="fillet.flange_edge")
          </span>
          <span />
          <span className="v" style={{ color: s >= 4 ? 'var(--focus)' : '#444' }}>
            {s >= 4 ? `[${tagged.join(', ')}]` : '··'}
          </span>
        </div>
      </Copy>
    </Chapter>
  );
};

// ---------------------------------------------------------------------------- 03 verify

export const VerifyChapter: React.FC = () => {
  const err = useJson<FilletError>('geometry/fillet_error/error.json');
  const fixed = useJson<CadDoc>('geometry/fillet_error/fixed.json');
  const phase = verifyPhase(useProgress('verify'));
  const pay = err?.payload;
  const meas = (pay?.measurements ?? []).map((m) => {
    const v = Array.isArray(m.value) ? `(${m.value.map((x) => +x.toFixed(3)).join(', ')})` : `${m.value}`;
    return `- ${m.name}: ${v} ${m.unit}`;
  });
  const body: { t: string; on: number; hot?: number }[] = pay
    ? [
        { t: `Operation: ${pay.operation}`, on: 0 },
        { t: `What happened: ${pay.what_happened}`, on: 0 },
        { t: 'Measurements:', on: 1 },
        ...meas.map((t) => ({ t, on: 1 })),
        { t: 'How to fix:', on: 1 },
        ...pay.repair.map((t, i) => ({ t: `- ${t}`, on: 1, hot: i === 0 ? 1 : undefined })),
        { t: `Technical details: ${pay.technical_details}`, on: 3 },
      ]
    : [];
  const r = phase === 2 ? err?.goodRadius ?? 3.8 : err?.badRadius ?? 12;
  return (
    <Chapter
      id="verify"
      length={2.6}
      viewport={{
        label: 'box 10 × 4 × 4 mm · fillet one edge',
        right: phase === 2 ? 'r = 3.8 · pass' : 'r = 12 · raised',
        foot: phase === 2 ? 'new fillet face tagged fillet.fixed' : 'the failing edge, located by the error payload',
      }}
    >
      <Copy id="verify">
        <Heading copy={VERIFY} />
        <Code
          lines={[
            { text: 'body = scad.fillet_rsolid(box, [edge],', state: 'on' },
            { text: `    radius=${r.toFixed(1)})`, state: 'hot', ink: phase === 2 ? 'pass' : 'fail' },
          ]}
        />
        <Panel
          className="err"
          head={`SimpleCADError · ${pay?.operation ?? 'fillet_rsolid'}`}
          right={phase === 2 ? 'resolved' : 'raised'}
          headClass={phase === 2 ? 'pass' : 'fail'}
        >
          <pre>
            {body.map((l, i) => (
              <span key={i} className={phase === 1 && l.hot === 1 ? 'hot' : phase >= l.on && phase < 2 ? 'on' : ''}>
                {l.t}
                {'\n'}
              </span>
            ))}
          </pre>
          {phase === 2 && fixed && (
            <div style={{ marginTop: 10, color: 'var(--pass)' }}>
              PASS r={err?.goodRadius} &lt; room=4 · faces={fixed.stats.faces} · volume={fixed.stats.volume_mm3} · tag=fillet.fixed
            </div>
          )}
        </Panel>
      </Copy>
    </Chapter>
  );
};

// ---------------------------------------------------------------------------- 04 params

const Slider: React.FC<{ label: string; name: string; value: number; min: number; max: number; unit?: string; fail?: boolean; digits?: number }> = ({
  label,
  name,
  value,
  min,
  max,
  unit = '',
  fail,
  digits = 1,
}) => (
  <div className={`slider ${fail ? 'fail' : ''}`}>
    <span>
      {label}
      <br />
      <span className="param">{name}</span>
    </span>
    <span className="track">
      <b style={{ left: `${((value - min) / (max - min)) * 100}%` }} />
    </span>
    <span className="val">
      {value.toFixed(digits)}
      {unit}
    </span>
  </div>
);

export const ParamsChapter: React.FC = () => {
  const idx = useJson<FlangeIndex>('geometry/flange/index.json');
  const p = useProgress('params');
  if (!idx)
    return (
      <Chapter id="params" length={3} viewport={{ label: 'flange_plate.py' }}>
        <Copy id="params">
          <Heading copy={PARAMS} />
        </Copy>
      </Chapter>
    );
  const n = idx.variants.length;
  const k = paramsStep(p, n);
  const rejected = k < 0 && idx.rejected;
  const v = k < 0 ? idx.variants[n - 3] : idx.variants[k];
  const pcd = rejected ? idx.rejected!.bolt_pcd : v.bolt_pcd;
  const count = rejected ? idx.rejected!.bolt_count : v.bolt_count;
  const web = idx.params.flange_od / 2 - pcd / 2 - idx.params.bolt_d / 2;
  return (
    <Chapter
      id="params"
      length={3}
      viewport={{
        label: `flange_plate.py · ${count} × ⌀${idx.params.bolt_d} on PCD ${pcd}`,
        right: rejected ? 'refused by guard' : `${v.faces} faces`,
        foot: rejected ? 'the notebook never reached the kernel: the last valid model stays' : 'each step is a full notebook run with overrides',
      }}
    >
      <Copy id="params">
        <Heading copy={PARAMS} />
        <Panel head="flange_plate.py · params: bolt pattern" right={rejected ? 'rejected · G2a' : 'rebuilt'} headClass={rejected ? 'fail' : undefined} className="err">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Slider label="Bolt count" name="BOLT_COUNT" value={count} min={4} max={12} digits={0} />
            <Slider label="Bolt circle" name="BOLT_PCD" value={pcd} min={76} max={90} unit=" mm" fail={!!rejected} />
            <Slider label="Bolt hole" name="BOLT_D" value={idx.params.bolt_d} min={6} max={14} unit=" mm" />
            <div className="readout">
              <span className="k">web = OD/2 − PCD/2 − d/2</span>
              <span />
              <span className="v" style={{ color: web >= 2 ? 'var(--pass)' : 'var(--fail)' }}>
                {web.toFixed(3)} mm {web >= 2 ? '≥' : '<'} 2.0
              </span>
              <span className="k">faces · volume</span>
              <span />
              <span className="v">
                {rejected ? '— · never built' : `${v.faces} · ${fmt(v.volume, 1)} mm³`}
              </span>
            </div>
            {rejected && (
              <pre style={{ color: 'var(--fail)', whiteSpace: 'pre-wrap', margin: 0 }}>
                AssertionError: {idx.rejected!.message}
              </pre>
            )}
          </div>
        </Panel>
      </Copy>
    </Chapter>
  );
};

// ---------------------------------------------------------------------------- 05 assembly

const MODULES: Record<string, string> = { esc: 'ESC', motor: 'Motor', reducer: '20:1 reducer', output: 'Output' };

export const AssemblyChapter: React.FC = () => {
  const idx = useJson<BldcIndex>('geometry/bldc/index.json');
  const e = explode(useProgress('assembly'));
  return (
    <Chapter
      id="assembly"
      length={3}
      viewport={{
        label: 'integrated_bldc_joint_actuator.py',
        right: e > 0.5 ? 'exploded along the axis' : 'assembled',
        foot: `${idx?.leaves ?? '··'} solids · ${idx?.components ?? '··'} components · ${idx?.constraints ?? '··'} constraints, strict solve`,
      }}
    >
      <Copy id="assembly">
        <Heading copy={ASSEMBLY} />
        <div style={{ display: 'flex', gap: 40 }}>
          <div className="big">
            <b>{idx?.components ?? '··'}</b>
            <span>components</span>
          </div>
          <div className="big">
            <b>{idx?.constraints ?? '··'}</b>
            <span>constraints</span>
          </div>
        </div>
        <Code
          lines={[
            { text: 'actuator = scad.solve_assembly_constraints_rassembly(', state: 'on' },
            { text: '    assembly=_assembly, strict=True)', state: 'on' },
          ]}
        />
        <div className="kicker" style={{ flexWrap: 'wrap' }}>
          <span className="chip pass">All solved</span>
          {(idx?.moduleOrder ?? []).map((m, i) => (
            <span key={m} className={e > 0.15 + i * 0.12 ? 'chip' : ''} style={{ color: e > 0.15 + i * 0.12 ? undefined : '#555' }}>
              {MODULES[m] ?? m}
            </span>
          ))}
        </div>
        <p className="body" style={{ color: 'var(--dim)' }}>
          examples/integrated_bldc_joint_actuator · {idx?.leaves ?? '··'} solids from part and sub-assembly notebooks.
        </p>
      </Copy>
    </Chapter>
  );
};

// ---------------------------------------------------------------------------- 06 sim

export const SimChapter: React.FC = () => {
  const field = useJson<FieldIndex>('geometry/fem/field.json');
  const brep = useJson<CadDoc>('geometry/fem/bracket.json');
  const p = useProgress('sim');
  const f = simField(p);
  const d = simDeform(p);
  const tags = brep ? [...new Set(brep.faces.flatMap((x) => x.tags))].sort() : [];
  return (
    <Chapter
      id="sim"
      length={3}
      viewport={{
        label: f > 0.5 ? 'CalculiX · nodal von Mises' : 'bracket.py · BRep with interface tags',
        right: f > 0.5 ? `max ${field?.vmMax.toFixed(1) ?? '··'} MPa` : `${tags.length} tags`,
        foot: f > 0.5 ? 'Gmsh volume mesh from the AP242 export · displacement exaggerated' : 'fixed support and load surface, picked by tag',
      }}
    >
      <Copy id="sim">
        <Heading copy={SIM} />
        <Panel head="bracket.py · interface tags" right={f > 0.5 ? 'calculix' : 'brep'}>
          <div className="tags">
            {tags.map((t) => (
              <div key={t} className={`tag ${LOAD_CASE_TAGS.includes(t) ? 'on' : ''}`}>
                <span>{t}</span>
                <span>{t === 'interface.fixed_support' ? 'fixed, u = 0' : t === 'interface.load_surface' ? `F_z = ${field?.loadZ ?? -1000} N` : ''}</span>
              </div>
            ))}
          </div>
        </Panel>
        {field && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: f > 0.05 ? 1 : 0.25 }}>
            <div className="legend">
              {FEM_RAMP.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </div>
            <div className="legend-scale">
              <span>0</span>
              <span>{(field.vmMax / 4).toFixed(1)}</span>
              <span>{field.vmMax.toFixed(1)}</span>
            </div>
            <div className="legend-scale" style={{ justifyContent: 'center' }}>
              <span>von Mises, nodal · MPa · square-root colour scale</span>
            </div>
            <div className="readout">
              <span className="k">Gmsh tets · nodes</span>
              <span />
              <span className="v">
                {fmt(field.elements)} · {fmt(field.volumeNodes)}
              </span>
              <span className="k">reaction F_z</span>
              <span />
              <span className="v">{fmt(field.summary.reaction_force_z_n ?? 0, 1)} N</span>
              <span className="k">max |u|</span>
              <span />
              <span className="v">{field.dispMax.toFixed(4)} mm</span>
              <span className="k">shape exaggerated</span>
              <span />
              <span className="v">×{fmt(d > 0 ? exaggeration(p, field.dispMax) : 0)}</span>
            </div>
          </div>
        )}
      </Copy>
    </Chapter>
  );
};

// ---------------------------------------------------------------------------- 07 compose

const LENGTH_NAME: Record<string, string> = {
  ground_span: 'GROUND_LENGTH',
  crank: 'CRANK_LENGTH',
  coupler: 'COUPLER_LENGTH',
  rocker: 'ROCKER_LENGTH',
};

export const ComposeChapter: React.FC = () => {
  const idx = useJson<FourbarIndex>('geometry/fourbar/index.json');
  const k = composeActive(useProgress('compose'));
  const lines: CodeLine[] = [
    { text: '@app.cell', state: 'on' },
    { text: 'def _():', state: 'on' },
  ];
  COMPOSE_LINKS.forEach((id, i) => {
    const st = i === k ? 'hot' : 'on';
    lines.push({ text: `    ${id} = scad.use("link_bar.py", id="${id}",`, state: st, ink: i === k ? 'focus' : undefined });
    lines.push({ text: `        CENTER_DISTANCE=${LENGTH_NAME[id]})`, state: st, ink: i === k ? 'focus' : undefined });
  });
  lines.push({ text: '    pivot_bolt = scad.use("pivot_bolt.py")', state: 'on' });
  const active = idx?.links.find((l) => l.asset === COMPOSE_LINKS[k]);
  return (
    <Chapter
      id="compose"
      length={3}
      viewport={{
        label: 'four_bar_linkage.py',
        right: `use("link_bar.py", id="${COMPOSE_LINKS[k]}")`,
        foot: `${idx?.components ?? '··'} components · ${idx?.constraints ?? '··'} constraints · one part notebook, four ids`,
      }}
    >
      <Copy id="compose">
        <Heading copy={COMPOSE} />
        <Panel head="examples/four_bar_linkage/four_bar_linkage.py" right={`${idx?.components ?? '·'} components`}>
          <Code lines={lines} />
        </Panel>
        <div className="stdout">
          <b>$ sca run link_bar.py --id {active?.part_id ?? 'crank'} --set CENTER_DISTANCE={active?.center_distance ?? 20}</b>
          {'\n'}
          {active ? `  product ${active.part_id} · ${active.faces} faces · ${fmt(active.volume, 3)} mm³` : ''}
        </div>
      </Copy>
    </Chapter>
  );
};

// ---------------------------------------------------------------------------- 08 close

export const Close: React.FC = () => (
  <Chapter id="close" length={1} className="close">
    <Copy id="close">
      <h2 className="title">
        {CLOSE.lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </h2>
      <p className="body">{CLOSE.body}</p>
      <Install command={HERO.install} />
      <div className="links">
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href={PYPI_URL} target="_blank" rel="noreferrer">
          PyPI
        </a>
        <a href={DOCS_URL} target="_blank" rel="noreferrer">
          Docs
        </a>
        <a href={PAPER_URL} target="_blank" rel="noreferrer">
          CADIR paper
        </a>
      </div>
    </Copy>
  </Chapter>
);
