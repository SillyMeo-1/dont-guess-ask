window.__ModuleLoader__.load({
  id: '@local/dont-guess-ask',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const NS = 'dont-guess-ask';
    const API = '/dont-guess-api';

    /* -------------------------------------------------------------- */
    /* Copy                                                           */
    /* -------------------------------------------------------------- */

    const zh = {
      nav: '不猜需求',
      title: '我不猜会问你',
      subtitle: '我在动手前，把推断出的需求放进选择框让你挑，而不是自己猜着往下做。',
      frequency: '提问频率',
      balancedTitle: '平衡',
      balancedNote: '只在选错要返工的分叉处弹框；琐碎、可逆的选择我自己定，并说明。',
      strictTitle: '严格',
      strictNote: '成品里凡是你没说、由我替你定的东西，都先问一遍。',
      lightTitle: '轻量',
      lightNote: '只在方向明显分叉时问，日常小任务基本不打扰。',
      current: '当前',
      loading: '载入中…',
      saving: '正在保存…',
      saved: '已生效，下一轮对话就用新规则。',
      saveFailed: '保存失败',
      loadFailed: '读取设置失败',
      loginHint: '登录状态已失效，刷新页面后再试。',
      retry: '重试',
      bannerTitle: '横幅位置',
      bannerHint: '问题等你回答、而你没看着这个会话时，这条提示出现在屏幕的这个角；点它会回到 DSH。',
      posTopLeft: '左上',
      posTopCenter: '顶部居中',
      posTopRight: '右上',
      posBottomLeft: '左下',
      posBottomCenter: '底部居中',
      posBottomRight: '右下',
      footnote: '选择框左上角的小标签、追加规则（header / extraRule）仍在 profile 的 cordis.patch.yml 里改。',
    };

    const en = {
      nav: 'Ask first',
      title: 'Ask, don\'t guess',
      subtitle: 'Before acting, I put the requirement I inferred into a choice card instead of guessing and running ahead.',
      frequency: 'How often to ask',
      balancedTitle: 'Balanced',
      balancedNote: 'I ask only where a wrong reading means redoing work; small, reversible choices I make myself and say so.',
      strictTitle: 'Strict',
      strictNote: 'I ask about anything in the result you did not specify and I would otherwise decide for you.',
      lightTitle: 'Light',
      lightNote: 'I ask only when the whole direction forks; everyday small tasks stay uninterrupted.',
      current: 'Current',
      loading: 'Loading…',
      saving: 'Saving…',
      saved: 'Applied. The next turn uses the new rule.',
      saveFailed: 'Save failed',
      loadFailed: 'Could not load settings',
      loginHint: 'Your session expired; reload the page and try again.',
      retry: 'Retry',
      bannerTitle: 'Banner position',
      bannerHint: 'Where the waiting banner appears while a question waits and you are looking elsewhere; clicking it brings DSH back.',
      posTopLeft: 'Top left',
      posTopCenter: 'Top centre',
      posTopRight: 'Top right',
      posBottomLeft: 'Bottom left',
      posBottomCenter: 'Bottom centre',
      posBottomRight: 'Bottom right',
      footnote: 'The card tag and extra rules (header / extraRule) are still set in the profile cordis.patch.yml.',
    };

    /** Ordered policy modes; copy lives in the dictionaries under `<id>Title`. */
    const MODES = [
      { id: 'balanced', title: 'balancedTitle', note: 'balancedNote' },
      { id: 'strict', title: 'strictTitle', note: 'strictNote' },
      { id: 'light', title: 'lightTitle', note: 'lightNote' },
    ];

    /** Banner anchors; copy lives in the dictionaries under `<id>`. */
    const POSITIONS = [
      { id: 'top-left', label: 'posTopLeft' },
      { id: 'top-center', label: 'posTopCenter' },
      { id: 'top-right', label: 'posTopRight' },
      { id: 'bottom-left', label: 'posBottomLeft' },
      { id: 'bottom-center', label: 'posBottomCenter' },
      { id: 'bottom-right', label: 'posBottomRight' },
    ];

    /* -------------------------------------------------------------- */
    /* Styles                                                         */
    /* -------------------------------------------------------------- */

    const CSS = `
.dga-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 2px 28px;
  color: var(--dsw-alias-label-primary);
}
.dga-head { display: flex; flex-direction: column; gap: 6px; }
.dga-title { margin: 0; font-size: 20px; font-weight: 650; line-height: 1.3; }
.dga-sub { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.dga-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
  min-inline-size: 0;
}
.dga-legend {
  margin: 0 0 2px;
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.dga-option {
  position: relative;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
  transition: border-color .15s ease;
}
.dga-option:hover { border-color: var(--dsw-alias-border-l2); }
.dga-option.is-active { border-color: var(--dsw-alias-brand-primary); }
.dga-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}
.dga-dot {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 1.5px solid var(--dsw-alias-border-l2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dga-option.is-active .dga-dot { border-color: var(--dsw-alias-brand-primary); }
.dga-option.is-active .dga-dot::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
}
.dga-option input:focus-visible + .dga-dot {
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-base), 0 0 0 4px var(--dsw-alias-brand-primary);
}
.dga-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dga-option-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dga-option-title { font-size: 14px; font-weight: 550; }
.dga-current {
  padding: 0 6px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-brand-primary);
}
.dga-option-note { font-size: 12.5px; line-height: 1.45; color: var(--dsw-alias-label-secondary); }
.dga-field { display: flex; flex-direction: column; gap: 8px; }
.dga-field .dga-legend { margin: 0; }
.dga-hint { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--dsw-alias-label-secondary); }
.dga-pos-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.dga-pos {
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: border-color .15s ease;
}
.dga-pos:hover { border-color: var(--dsw-alias-border-l2); }
.dga-pos.is-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dga-pos:disabled { opacity: .6; cursor: default; }
.dga-status { margin: 0; min-height: 18px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-success-primary); }
.dga-status.is-pending { color: var(--dsw-alias-label-secondary); }
.dga-error {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 10px;
  font-size: 13px;
  color: var(--dsw-alias-state-error-primary);
}
.dga-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.dga-note { margin: 0; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.dga-foot { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
@media (max-width: 420px) {
  .dga-page { gap: 12px; }
  .dga-option { padding: 11px 12px; }
}
`;

    /* -------------------------------------------------------------- */
    /* Navigation icon                                                */
    /* -------------------------------------------------------------- */

    function NavIcon({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 36 36',
        fill: 'none',
        'aria-hidden': 'true',
      },
      h('rect', {
        x: 3.5, y: 3.5, width: 29, height: 21, rx: 6.5,
        stroke: 'currentColor', strokeWidth: 2.4,
      }),
      h('path', {
        d: 'M11.4 23.2v6l6.4-6',
        stroke: 'currentColor', strokeWidth: 2.4,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M13.8 11.2c0-2.4 1.9-4.1 4.2-4.1s4.2 1.7 4.2 4.1c0 1.9-1.2 3-3 4-.7.4-1.2.9-1.2 1.7v.6',
        stroke: 'currentColor', strokeWidth: 2.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
      h('circle', { cx: 18, cy: 20.2, r: 1.6, fill: 'currentColor' }));
    }

    /* -------------------------------------------------------------- */
    /* API                                                            */
    /* -------------------------------------------------------------- */

    async function request(path, options = {}) {
      const init = {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      };
      if (options.body !== undefined) {
        init.method = 'POST';
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(API + path, init);
      let payload = null;
      try { payload = await response.json(); } catch { /* not JSON */ }
      if (response.status === 401 || response.status === 403) throw new Error('UNAUTHORIZED');
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload?.error?.message || `HTTP ${response.status}`);
      }
      return payload.data;
    }

    function errorText(error, t) {
      if (error && error.message === 'UNAUTHORIZED') return t('loginHint');
      return error instanceof Error ? error.message : String(error);
    }

    /* -------------------------------------------------------------- */
    /* Page                                                           */
    /* -------------------------------------------------------------- */

    function SettingsPage({ t }) {
      const [mode, setMode] = useState(null);
      const [position, setPosition] = useState(null);
      const [phase, setPhase] = useState('loading');
      const [error, setError] = useState(null);

      const load = useCallback(async () => {
        setPhase('loading');
        setError(null);
        try {
          const data = await request('/state');
          setMode(data.mode);
          setPosition(data.position ?? 'top-left');
          setPhase('ready');
        } catch (err) {
          setError(errorText(err, t));
          setPhase('error');
        }
      }, [t]);

      useEffect(() => { load(); }, [load]);

      const choose = useCallback(async (next) => {
        if (phase === 'saving' || next === mode) return;
        const previous = mode;
        setMode(next);
        setPhase('saving');
        setError(null);
        try {
          await request('/mode', { method: 'POST', body: { mode: next } });
          setPhase('saved');
        } catch (err) {
          setMode(previous);
          setError(errorText(err, t));
          setPhase('error');
        }
      }, [mode, phase, t]);

      const choosePosition = useCallback(async (next) => {
        if (phase === 'saving' || next === position) return;
        const previous = position;
        setPosition(next);
        setPhase('saving');
        setError(null);
        try {
          await request('/position', { method: 'POST', body: { position: next } });
          setPhase('saved');
        } catch (err) {
          setPosition(previous);
          setError(errorText(err, t));
          setPhase('error');
        }
      }, [position, phase, t]);

      const status = phase === 'saving' ? t('saving') : phase === 'saved' ? t('saved') : '';

      return h('div', { className: 'dga-page' },
        h('style', null, CSS),
        h('header', { className: 'dga-head' },
          h('h2', { className: 'dga-title' }, t('title')),
          h('p', { className: 'dga-sub' }, t('subtitle')),
        ),
        phase === 'loading'
          ? h('p', { className: 'dga-note' }, t('loading'))
          : h(React.Fragment, null,
            h('fieldset', { className: 'dga-group', disabled: phase === 'saving' },
              h('legend', { className: 'dga-legend' }, t('frequency')),
              MODES.map(entry => {
                const active = mode === entry.id;
                return h('label', { key: entry.id, className: 'dga-option' + (active ? ' is-active' : '') },
                  h('input', {
                    type: 'radio',
                    name: 'dga-mode',
                    value: entry.id,
                    checked: active,
                    onChange: () => choose(entry.id),
                  }),
                  h('span', { className: 'dga-dot', 'aria-hidden': 'true' }),
                  h('span', { className: 'dga-copy' },
                    h('span', { className: 'dga-option-head' },
                      h('span', { className: 'dga-option-title' }, t(entry.title)),
                      active ? h('span', { className: 'dga-current' }, t('current')) : null,
                    ),
                    h('span', { className: 'dga-option-note' }, t(entry.note)),
                  ),
                );
              }),
            ),
            h('div', { className: 'dga-field' },
              h('p', { className: 'dga-legend' }, t('bannerTitle')),
              h('p', { className: 'dga-hint' }, t('bannerHint')),
              h('div', {
                className: 'dga-pos-grid',
                role: 'radiogroup',
                'aria-label': t('bannerTitle'),
              },
                POSITIONS.map(entry => {
                  const active = position === entry.id;
                  return h('button', {
                    key: entry.id,
                    type: 'button',
                    role: 'radio',
                    'aria-checked': active,
                    className: 'dga-pos' + (active ? ' is-active' : ''),
                    disabled: phase === 'saving' || position === null,
                    onClick: () => choosePosition(entry.id),
                  }, t(entry.label));
                }),
              ),
            ),
          ),
        h('p', {
          className: 'dga-status' + (phase === 'saving' ? ' is-pending' : ''),
          role: 'status',
          'aria-live': 'polite',
        }, status),
        error
          ? h('div', { className: 'dga-error', role: 'alert' },
            h('span', null, `${phase === 'error' && mode === null ? t('loadFailed') : t('saveFailed')}：${error}`),
            h('button', { type: 'button', className: 'dga-link', onClick: load }, t('retry')),
          )
          : null,
        h('p', { className: 'dga-foot' }, t('footnote')),
      );
    }

    /* -------------------------------------------------------------- */
    /* Plugin                                                         */
    /* -------------------------------------------------------------- */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dont-guess-ask: dictionaries');
        const t = ctx.locale.bind(NS);

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dont-guess-ask',
          order: 28,
          label: () => t('nav'),
        }, () => h(SettingsPage, { t })));

        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: 'dont-guess-ask',
        }, (owner = {}) => h(NavIcon, { size: owner.size ?? 16 })));
      },
    };
  },
});
