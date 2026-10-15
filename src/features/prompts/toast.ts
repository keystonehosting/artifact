// Short in-page notices with optional actions, one at a time, in a closed
// shadow host at the bottom right.
import { h } from 'preact';
import { mountShadow, pageIsDark, type ShadowMount } from '../../ui/shadow';
import { t } from '../../core/i18n/t';

let mount: ShadowMount | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export interface ToastAction {
  label: string;
  run: () => void;
}

export function hideToast(): void {
  clearTimeout(timer);
  mount?.remove();
  mount = null;
}

/** Shows a notice. With actions it stays until dismissed; otherwise it fades after `ms`. */
export function toast(text: string, actions: ToastAction[] = [], ms = 3500): void {
  hideToast();
  mount = mountShadow('artifact-toast');
  document.body.append(mount.host);
  mount.setTheme(pageIsDark());
  mount.update(
    h(
      'div',
      { class: 'toast info', role: 'status' },
      h('p', null, text),
      h(
        'div',
        { class: 'actions' },
        actions.map((a) =>
          h(
            'button',
            {
              onClick: () => {
                hideToast();
                a.run();
              },
            },
            a.label,
          ),
        ),
        actions.length ? h('button', { onClick: hideToast }, t('common_close')) : null,
      ),
    ),
  );
  if (!actions.length) timer = setTimeout(hideToast, ms);
}
