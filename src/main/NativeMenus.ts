import { Menu, type MenuItemConstructorOptions } from 'electron';
import { Localization, type Locale, type MessageKey } from '../shared/i18n/Localization';

export class NativeMenus {
  apply(locale: Locale): void {
    const { t } = new Localization(locale);
    const item = (
      role: NonNullable<MenuItemConstructorOptions['role']>,
      key: MessageKey,
    ): MenuItemConstructorOptions => ({ role, label: t(key) });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { label: 'Collection Studio', submenu: [item('quit', 'Quit')] },
        { label: t('File'), submenu: [item('close', 'Close')] },
        {
          label: t('Edit'),
          submenu: [
            item('undo', 'Undo'),
            item('redo', 'Redo'),
            { type: 'separator' },
            item('cut', 'Cut'),
            item('copy', 'Copy'),
            item('paste', 'Paste'),
            item('selectAll', 'Select All'),
          ],
        },
        {
          label: t('View'),
          submenu: [item('reload', 'Reload'), item('togglefullscreen', 'Toggle Full Screen')],
        },
        { label: t('Window'), submenu: [item('minimize', 'Minimize'), item('zoom', 'Zoom')] },
      ]),
    );
  }
}
