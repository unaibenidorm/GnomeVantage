/**
 * GnomeVantage - GNOME Shell Extension
 *
 * Control features of your Lenovo Legion or Ideapad laptop such as
 * battery fast charging, conservation mode, hybrid graphics and more.
 *
 * GNOME port by unaibenidorm, based on PlasmaVantage by Scias.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {VantageManager, VANTAGE_CONTROLS} from './vantageManager.js';
import {RebootDialog} from './rebootDialog.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const COLOR_SCHEME_KEY = 'color-scheme';

function resolvePanelIconKey(settings, interfaceSettings) {
    const iconSetting = settings.get_string('panel-icon-name') || 'plasmoid-auto';

    if (iconSetting !== 'plasmoid-auto')
        return iconSetting;

    const darkTheme = interfaceSettings.get_string(COLOR_SCHEME_KEY) === 'prefer-dark';
    return darkTheme ? 'plasmoid light' : 'plasmoid';
}

function removeStaleVantageQuickSettingsEntries() {
    const quickSettings = Main.panel?.statusArea?.quickSettings;
    const grid = quickSettings?.menu?._grid;
    if (!grid || !grid.get_children)
        return;

    for (const actor of grid.get_children()) {
        const delegate = actor?._delegate;
        if (!delegate || !delegate.destroy)
            continue;

        const titleText = typeof delegate.title === 'string'
            ? delegate.title
            : delegate.title?.text;

        const isVantageEntry =
            delegate._vantageSource === 'gnomevantage' ||
            delegate.constructor?.name === 'VantageQuickSettingsToggle' ||
            titleText === 'Vantage';

        if (isVantageEntry)
            delegate.destroy();
    }
}

/**
 * Custom PopupMenu item with an icon, label column, and a status button.
 * Replaces the KDE PlasmaComponents.ItemDelegate + Button pattern.
 */
const VantageMenuItem = GObject.registerClass(
class VantageMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(control, extensionPath, manager, rebootDialog) {
        super._init({
            reactive: true,
            can_focus: true,
        });

        this._control = control;
        this._manager = manager;
        this._rebootDialog = rebootDialog;
        this._value = -1;
        this._busy = false;
        this._needsReboot = false;

        // --- Icon ---
        const iconPath = `${extensionPath}/icons/${control.icon}-symbolic.svg`;
        const gicon = Gio.icon_new_for_string(iconPath);
        this._icon = new St.Icon({
            gicon,
            style_class: 'gnomevantage-item-icon popup-menu-icon',
            icon_size: 20,
        });
        this.add_child(this._icon);

        // --- Text column ---
        const textBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'gnomevantage-item-text',
        });

        this._nameLabel = new St.Label({
            text: control.name,
            style_class: 'gnomevantage-item-name',
        });

        this._descLabel = new St.Label({
            text: control.desc,
            style_class: 'gnomevantage-item-desc',
        });
        this._descLabel.clutter_text.ellipsize = 3; // PANGO_ELLIPSIZE_END

        textBox.add_child(this._nameLabel);
        textBox.add_child(this._descLabel);
        this.add_child(textBox);

        // --- Status button ---
        this._statusBtn = new St.Button({
            style_class: 'gnomevantage-status-btn gnomevantage-status-na',
            can_focus: true,
            reactive: true,
        });
        this._statusLabel = new St.Label({
            text: 'N/A',
            style_class: 'gnomevantage-status-label',
        });
        this._statusBtn.set_child(this._statusLabel);
        this._statusBtn.connect('clicked', () => this._onToggle());
        this.add_child(this._statusBtn);

        // Update initial state
        this._updateDisplay();
    }

    get value() {
        return this._value;
    }

    set value(v) {
        this._value = v;
        this._updateDisplay();
    }

    get busy() {
        return this._busy;
    }

    set busy(b) {
        this._busy = b;
        this._updateDisplay();
    }

    /**
     * Handle toggle click: flip the sysfs value or show reboot dialog.
     */
    async _onToggle() {
        if (this._needsReboot) {
            this._rebootDialog.open();
            return;
        }

        if (this._busy || (this._value !== 0 && this._value !== 1))
            return;

        this._busy = true;
        this._updateDisplay();

        const newValue = 1 - this._value;
        const success = await this._manager.writeParam(
            this._control.module, this._control.param, newValue
        );

        if (success) {
            // Re-read the actual value from sysfs
            const readValue = await this._manager.readParam(
                this._control.module, this._control.param
            );
            this._value = readValue;

            // Send notification
            this._sendNotification(newValue);

            // If this control requires reboot, show dialog
            if (this._control.reboot) {
                this._needsReboot = true;
                this._rebootDialog.open();
            }
        }

        this._busy = false;
        this._updateDisplay();
    }

    /**
     * Send a desktop notification about the state change.
     */
    _sendNotification(newValue) {
        const stateText = newValue === 1 ? 'enabled' : 'disabled';
        let body;

        if (this._control.reboot) {
            const futureState = (1 - this._value) === 1 ? 'enabled' : 'disabled';
            body = `${this._control.name} will be ${futureState} after the next reboot.`;
        } else {
            body = `${this._control.name} is now ${stateText}.`;
        }

        Main.notify('GnomeVantage', body);
    }

    /**
     * Refresh the on-screen status button text and style.
     */
    _updateDisplay() {
        // Remove all status classes
        this._statusBtn.remove_style_class_name('gnomevantage-status-active');
        this._statusBtn.remove_style_class_name('gnomevantage-status-inactive');
        this._statusBtn.remove_style_class_name('gnomevantage-status-pending');
        this._statusBtn.remove_style_class_name('gnomevantage-status-reboot');
        this._statusBtn.remove_style_class_name('gnomevantage-status-na');

        if (this._needsReboot) {
            this._statusLabel.text = 'REBOOT';
            this._statusBtn.add_style_class_name('gnomevantage-status-reboot');
        } else if (this._busy) {
            this._statusLabel.text = 'PENDING';
            this._statusBtn.add_style_class_name('gnomevantage-status-pending');
        } else if (this._value === 1) {
            this._statusLabel.text = 'ACTIVE';
            this._statusBtn.add_style_class_name('gnomevantage-status-active');
        } else if (this._value === 0) {
            this._statusLabel.text = 'INACTIVE';
            this._statusBtn.add_style_class_name('gnomevantage-status-inactive');
        } else {
            this._statusLabel.text = 'N/A';
            this._statusBtn.add_style_class_name('gnomevantage-status-na');
        }
    }

    /**
     * Read the current value from sysfs and update the display.
     */
    async refresh() {
        const val = await this._manager.readParam(
            this._control.module, this._control.param
        );
        this._value = val;
        this._busy = false;
        this._updateDisplay();
    }
});

/**
 * The panel button indicator shown in the GNOME top bar.
 */
const VantageIndicator = GObject.registerClass(
class VantageIndicator extends PanelMenu.Button {
    _init(extensionPath, settings) {
        super._init(0.0, 'GnomeVantage');

        this._extensionPath = extensionPath;
        this._settings = settings;
        this._interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
        this._manager = new VantageManager();
        this._rebootDialog = new RebootDialog(this._manager);
        this._menuItems = [];
        this._showTopBarSignalId = 0;
        this._panelIconSignalId = 0;
        this._interfaceSignalId = 0;
        this._menuOpenSignalId = 0;

        // --- Panel icon ---
        this._panelIcon = new St.Icon({
            icon_name: 'computer-laptop-symbolic',
            style_class: 'system-status-icon gnomevantage-panel-icon',
        });
        this.add_child(this._panelIcon);

        if (this._settings) {
            this._showTopBarSignalId = this._settings.connect(
                'changed::show-top-bar-icon', () => this._updateTopBarVisibility()
            );
            this._panelIconSignalId = this._settings.connect(
                'changed::panel-icon-name', () => this._updatePanelIcon()
            );
        }

        this._interfaceSignalId = this._interfaceSettings.connect(
            `changed::${COLOR_SCHEME_KEY}`, () => this._updatePanelIcon()
        );

        this._updatePanelIcon();
        this._updateTopBarVisibility();

        // --- Build popup menu ---
        this._buildMenu();

        // --- Refresh on menu open ---
        this._menuOpenSignalId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen)
                this._refreshAll();
        });

        // --- Initial read ---
        this._refreshAll();
    }

    /**
     * Build the popup menu structure with section headers and toggle items.
     */
    _buildMenu() {
        // Header
        const headerItem = new PopupMenu.PopupMenuItem('GnomeVantage', {
            reactive: false,
            can_focus: false,
        });
        headerItem.label.add_style_class_name('gnomevantage-header');
        this.menu.addMenuItem(headerItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Group controls by module
        const ideapadControls = VANTAGE_CONTROLS.filter(c => c.module === 'ideapad');
        const legionControls = VANTAGE_CONTROLS.filter(c => c.module === 'legion');

        // Ideapad section
        if (ideapadControls.length > 0) {
            const ideapadSection = new PopupMenu.PopupSeparatorMenuItem('Ideapad');
            this.menu.addMenuItem(ideapadSection);

            for (const control of ideapadControls) {
                if (!this._manager.isParamAvailable(control.module, control.param))
                    continue;

                // Check if hidden via preferences
                const settingsKey = `show-${control.id.replace(/_/g, '-')}`;
                if (this._settings && !this._settings.get_boolean(settingsKey))
                    continue;

                const item = new VantageMenuItem(
                    control, this._extensionPath, this._manager, this._rebootDialog
                );
                this.menu.addMenuItem(item);
                this._menuItems.push(item);
            }
        }

        // Legion section
        if (legionControls.length > 0) {
            const legionSection = new PopupMenu.PopupSeparatorMenuItem('Legion');
            this.menu.addMenuItem(legionSection);

            for (const control of legionControls) {
                if (!this._manager.isParamAvailable(control.module, control.param))
                    continue;

                // Check if hidden via preferences
                const settingsKey = `show-${control.id.replace(/_/g, '-')}`;
                if (this._settings && !this._settings.get_boolean(settingsKey))
                    continue;

                const item = new VantageMenuItem(
                    control, this._extensionPath, this._manager, this._rebootDialog
                );
                this.menu.addMenuItem(item);
                this._menuItems.push(item);
            }
        }

        // If no controls are available at all, show an info message
        if (this._menuItems.length === 0) {
            const noItems = new PopupMenu.PopupMenuItem(
                'No supported hardware detected.\nMake sure ideapad_acpi or legion modules are loaded.',
                {reactive: false}
            );
            noItems.label.clutter_text.line_wrap = true;
            noItems.label.add_style_class_name('gnomevantage-no-hw');
            this.menu.addMenuItem(noItems);
        }
    }

    /**
     * Refresh all menu items by re-reading sysfs values.
     */
    _refreshAll() {
        for (const item of this._menuItems)
            item.refresh();
    }

    _updateTopBarVisibility() {
        if (!this._settings) {
            this.visible = true;
            this.opacity = 255;
            return;
        }

        const showTopBarIcon = this._settings.get_boolean('show-top-bar-icon');
        this.visible = showTopBarIcon;
        if (showTopBarIcon)
            this.opacity = 255;
    }

    _updatePanelIcon() {
        if (!this._settings)
            return;

        const selectedIcon = resolvePanelIconKey(this._settings, this._interfaceSettings);

        if (selectedIcon.endsWith('-symbolic')) {
            this._panelIcon.gicon = null;
            this._panelIcon.icon_name = selectedIcon;
            return;
        }

        const customIconPath = `${this._extensionPath}/icons/${selectedIcon}.svg`;
        if (GLib.file_test(customIconPath, GLib.FileTest.EXISTS)) {
            this._panelIcon.icon_name = null;
            this._panelIcon.gicon = Gio.icon_new_for_string(customIconPath);
            return;
        }

        this._panelIcon.gicon = null;
        this._panelIcon.icon_name = 'computer-laptop-symbolic';
    }

    openFromQuickSettings() {
        const hiddenFromTopBar = this._settings && !this._settings.get_boolean('show-top-bar-icon');

        if (Main.panel.closeQuickSettings)
            Main.panel.closeQuickSettings();

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            let restoreSignalId = 0;

            if (hiddenFromTopBar) {
                this.visible = true;
                this.opacity = 0;

                restoreSignalId = this.menu.connect('open-state-changed', (menu, isOpen) => {
                    if (isOpen)
                        return;

                    if (restoreSignalId)
                        menu.disconnect(restoreSignalId);

                    this.opacity = 255;
                    this._updateTopBarVisibility();
                });
            }

            this.menu.open();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Clean up all resources.
     */
    destroy() {
        if (this._menuOpenSignalId)
            this.menu.disconnect(this._menuOpenSignalId);

        if (this._interfaceSignalId)
            this._interfaceSettings.disconnect(this._interfaceSignalId);

        if (this._settings && this._showTopBarSignalId)
            this._settings.disconnect(this._showTopBarSignalId);

        if (this._settings && this._panelIconSignalId)
            this._settings.disconnect(this._panelIconSignalId);

        this._menuOpenSignalId = 0;
        this._showTopBarSignalId = 0;
        this._panelIconSignalId = 0;
        this._interfaceSignalId = 0;
        this._manager.destroy();
        this._rebootDialog.destroy();
        this._menuItems = [];
        super.destroy();
    }
});

const VantageQuickSettingsToggle = GObject.registerClass(
class VantageQuickSettingsToggle extends QuickSettings.QuickToggle {
    _init(settings, interfaceSettings, topBarIndicator) {
        super._init({
            title: 'Vantage',
            iconName: 'computer-laptop-symbolic',
        });

        this._settings = settings;
        this._interfaceSettings = interfaceSettings;
        this._topBarIndicator = topBarIndicator;
        this._settingsSignals = [];
        this._interfaceSignalId = 0;
        this._vantageSource = 'gnomevantage';

        this.connect('clicked', () => this._openTopBarMenu());

        this._settingsSignals.push(this._settings.connect(
            'changed::panel-icon-name', () => this._updateIcon()
        ));

        this._interfaceSignalId = this._interfaceSettings.connect(
            `changed::${COLOR_SCHEME_KEY}`, () => this._updateIcon()
        );

        this._updateIcon();
    }

    _openTopBarMenu() {
        this._topBarIndicator.openFromQuickSettings();
    }

    _updateIcon() {
        const selectedIcon = resolvePanelIconKey(this._settings, this._interfaceSettings);
        this.iconName = selectedIcon.endsWith('-symbolic')
            ? selectedIcon
            : 'computer-laptop-symbolic';
    }

    destroy() {
        if (this._interfaceSignalId)
            this._interfaceSettings.disconnect(this._interfaceSignalId);

        for (const signalId of this._settingsSignals)
            this._settings.disconnect(signalId);

        this._interfaceSignalId = 0;
        this._settingsSignals = [];
        super.destroy();
    }
});

const VantageQuickSettingsDropdown = GObject.registerClass(
class VantageQuickSettingsDropdown extends QuickSettings.QuickMenuToggle {
    _init(settings, interfaceSettings, topBarIndicator) {
        super._init({
            title: 'Vantage',
            iconName: 'computer-laptop-symbolic',
        });

        this._settings = settings;
        this._interfaceSettings = interfaceSettings;
        this._topBarIndicator = topBarIndicator;
        this._settingsSignals = [];
        this._interfaceSignalId = 0;
        this._vantageSource = 'gnomevantage';

        this.menu.setHeader('computer-laptop-symbolic', 'Vantage');

        const openItem = new PopupMenu.PopupMenuItem(_('Open controls'));
        openItem.connect('activate', () => this._openTopBarMenu());
        this.menu.addMenuItem(openItem);

        this._settingsSignals.push(this._settings.connect(
            'changed::panel-icon-name', () => this._updateIcon()
        ));

        this._interfaceSignalId = this._interfaceSettings.connect(
            `changed::${COLOR_SCHEME_KEY}`, () => this._updateIcon()
        );

        this._updateIcon();
    }

    _openTopBarMenu() {
        this._topBarIndicator.openFromQuickSettings();
    }

    _updateIcon() {
        const selectedIcon = resolvePanelIconKey(this._settings, this._interfaceSettings);
        this.iconName = selectedIcon.endsWith('-symbolic')
            ? selectedIcon
            : 'computer-laptop-symbolic';
    }

    destroy() {
        if (this._interfaceSignalId)
            this._interfaceSettings.disconnect(this._interfaceSignalId);

        for (const signalId of this._settingsSignals)
            this._settings.disconnect(signalId);

        this._interfaceSignalId = 0;
        this._settingsSignals = [];
        super.destroy();
    }
});

const VantageQuickSettingsIndicator = GObject.registerClass(
class VantageQuickSettingsIndicator extends QuickSettings.SystemIndicator {
    _init(settings, interfaceSettings, topBarIndicator) {
        super._init();

        this._settings = settings;
        this._settingsSignals = [];
        this._buttonItem = new VantageQuickSettingsToggle(
            settings, interfaceSettings, topBarIndicator
        );
        this._dropdownItem = new VantageQuickSettingsDropdown(
            settings, interfaceSettings, topBarIndicator
        );

        this.quickSettingsItems.push(this._buttonItem);
        this.quickSettingsItems.push(this._dropdownItem);

        this._settingsSignals.push(this._settings.connect(
            'changed::show-quick-settings-entry', () => this._updateVisibility()
        ));

        this._settingsSignals.push(this._settings.connect(
            'changed::show-quick-settings-dropdown', () => this._updateVisibility()
        ));

        this._updateVisibility();
    }

    _updateVisibility() {
        const visible = this._settings.get_boolean('show-quick-settings-entry');
        const showDropdown = this._settings.get_boolean('show-quick-settings-dropdown');

        this._buttonItem.visible = visible && !showDropdown;
        this._dropdownItem.visible = visible && showDropdown;
    }

    destroy() {
        for (const signalId of this._settingsSignals)
            this._settings.disconnect(signalId);

        for (const item of this.quickSettingsItems)
            item.destroy();

        this.quickSettingsItems.length = 0;
        this._settingsSignals = [];
        super.destroy();
    }
});

/**
 * Extension entry point.
 */
export default class GnomeVantageExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._settings = null;
        this._interfaceSettings = null;
        this._quickSettingsIndicator = null;
    }

    _destroyQuickSettingsIndicator() {
        if (!this._quickSettingsIndicator)
            return;

        this._quickSettingsIndicator.destroy();
        this._quickSettingsIndicator = null;
    }

    _destroyTopBarIndicator() {
        if (!this._indicator)
            return;

        this._indicator.destroy();
        this._indicator = null;
    }

    _cleanupStaleQuickSettingsEntries() {
        const quickSettings = Main.panel.statusArea.quickSettings;
        const externalIndicators = quickSettings?._externalIndicators;

        if (!Array.isArray(externalIndicators))
            return;

        for (const indicator of [...externalIndicators]) {
            if (!indicator?.quickSettingsItems || indicator.quickSettingsItems.length === 0)
                continue;

            const isVantageIndicator = indicator.quickSettingsItems.some(
                item => item?.title === 'Vantage'
            );

            if (!isVantageIndicator)
                continue;

            try {
                indicator.destroy();
            } catch (e) {
                console.error(`[GnomeVantage] Failed to cleanup stale Quick Settings indicator: ${e.message}`);
            }
        }
    }

    enable() {
        console.log('[GnomeVantage] Enabling extension');

        // Be defensive if GNOME lifecycle calls enable() without a clean disable().
        if (this._indicator || this._quickSettingsIndicator) {
            console.warn('[GnomeVantage] enable() called while already active; cleaning old instance');
            this.disable();
        }

        removeStaleVantageQuickSettingsEntries();
        this._cleanupStaleQuickSettingsEntries();

        this._settings = this.getSettings();
        this._interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
        this._indicator = new VantageIndicator(this.path, this._settings);
        Main.panel.addToStatusArea('gnomevantage', this._indicator);

        this._quickSettingsIndicator = new VantageQuickSettingsIndicator(
            this._settings,
            this._interfaceSettings,
            this._indicator
        );
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._quickSettingsIndicator);
    }

    disable() {
        console.log('[GnomeVantage] Disabling extension');
        this._destroyQuickSettingsIndicator();
        this._destroyTopBarIndicator();
        this._interfaceSettings = null;
        this._settings = null;
    }
}
