/**
 * RebootDialog - Modal dialog requesting system reboot
 *
 * Replaces KDE's Kirigami.PromptDialog for settings that
 * require a reboot to take effect (e.g. hybrid graphics).
 *
 * SPDX-License-Identifier: MPL-2.0
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

export const RebootDialog = GObject.registerClass(
class RebootDialog extends ModalDialog.ModalDialog {
    _init(vantageManager) {
        super._init({
            styleClass: 'gnomevantage-reboot-dialog',
            destroyOnClose: false,
        });

        this._vantageManager = vantageManager;

        // --- Content ---
        const content = new St.BoxLayout({
            vertical: true,
            style_class: 'gnomevantage-reboot-content',
        });

        const icon = new St.Icon({
            icon_name: 'system-reboot-symbolic',
            icon_size: 48,
            style_class: 'gnomevantage-reboot-icon',
        });

        const title = new St.Label({
            text: 'Reboot Required',
            style_class: 'gnomevantage-reboot-title',
        });

        const subtitle = new St.Label({
            text: 'The system needs to be restarted for this setting to take effect.\nDo you want to reboot now?',
            style_class: 'gnomevantage-reboot-subtitle',
        });
        subtitle.clutter_text.line_wrap = true;

        content.add_child(icon);
        content.add_child(title);
        content.add_child(subtitle);
        this.contentLayout.add_child(content);

        // --- Buttons ---
        this.addButton({
            label: 'Cancel',
            action: () => this.close(),
            key: Clutter.KEY_Escape,
        });

        this.addButton({
            label: 'Reboot Now',
            action: () => {
                this.close();
                this._vantageManager.requestReboot();
            },
            default: true,
        });
    }
});
