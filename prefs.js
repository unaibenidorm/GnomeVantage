/**
 * GnomeVantage - Extension Preferences
 *
 * Preferences window using GTK4 and Adwaita widgets.
 * Allows users to configure which controls are visible and
 * top bar behavior, and password-less operation.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Control definitions (duplicated here because prefs.js runs in a
// separate GTK process without access to extension.js imports)
const CONTROL_DEFS = [
    {id: 'fn_lock',           name: 'Fn Lock',              module: 'ideapad'},
    {id: 'winkey',            name: 'Super Key',             module: 'legion'},
    {id: 'touchpad',          name: 'Touchpad',              module: 'legion'},
    {id: 'conservation_mode', name: 'Battery Conservation',  module: 'ideapad'},
    {id: 'rapidcharge',       name: 'Fast Charge',           module: 'legion'},
    {id: 'usb_charging',      name: 'Always On USB',         module: 'ideapad'},
    {id: 'overdrive',         name: 'Display Overdrive',     module: 'legion'},
    {id: 'gsync',             name: 'Hybrid Graphics',       module: 'legion'},
];

const PANEL_ICON_CHOICES = [
    {icon: 'plasmoid-auto', label: 'Original (Auto Theme)'},
    {icon: 'computer-laptop-symbolic', label: 'Laptop'},
    {icon: 'input-gaming-symbolic', label: 'Gaming'},
    {icon: 'applications-system-symbolic', label: 'System'},
    {icon: 'preferences-system-symbolic', label: 'Preferences'},
    {icon: 'utilities-terminal-symbolic', label: 'Terminal'},
    {icon: 'plasmoid', label: 'Original (Plasmoid Dark)'},
    {icon: 'plasmoid light', label: 'Original (Plasmoid Light)'},
];

export default class GnomeVantagePreferences extends ExtensionPreferences {
    _getPasswordlessSetupCommand() {
        return 'if command -v curl >/dev/null 2>&1; then curl -fsSL https://raw.githubusercontent.com/unaibenidorm/GnomeVantage/master/util/gnomevantage-noroot.service -o /etc/systemd/system/gnomevantage-noroot.service; elif command -v wget >/dev/null 2>&1; then wget -qO /etc/systemd/system/gnomevantage-noroot.service https://raw.githubusercontent.com/unaibenidorm/GnomeVantage/master/util/gnomevantage-noroot.service; else echo "Neither curl nor wget is installed." >&2; exit 1; fi && systemctl daemon-reload && systemctl enable --now gnomevantage-noroot.service';
    }

    _runSubprocess(argv) {
        return new Promise((resolve, reject) => {
            try {
                const proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (subprocess, result) => {
                    try {
                        const [, stdout, stderr] = subprocess.communicate_utf8_finish(result);
                        resolve({
                            ok: subprocess.get_successful(),
                            stdout: stdout ?? '',
                            stderr: stderr ?? '',
                        });
                    } catch (e) {
                        reject(e);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    async _installPasswordlessService(installRow, installButton) {
        installButton.sensitive = false;
        installRow.subtitle = _('Installing service (authentication may be required)...');

        try {
            const command = this._getPasswordlessSetupCommand();
            const result = await this._runSubprocess(['pkexec', 'sh', '-c', command]);

            if (result.ok) {
                installRow.subtitle = _('Service installed and started successfully.');
                return;
            }

            const details = (result.stderr || result.stdout || '').trim().split('\n')[0];
            installRow.subtitle = details
                ? `${_('Installation failed')}: ${details}`
                : _('Installation failed.');
        } catch (e) {
            installRow.subtitle = `${_('Installation failed')}: ${e.message}`;
        } finally {
            installButton.sensitive = true;
        }
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // =============================================
        // Page 1: Controls Visibility
        // =============================================
        const controlsPage = new Adw.PreferencesPage({
            title: _('Controls'),
            icon_name: 'emblem-system-symbolic',
        });
        window.add(controlsPage);

        // --- Ideapad Group ---
        const ideapadGroup = new Adw.PreferencesGroup({
            title: _('Ideapad Controls'),
            description: _('Toggle visibility of controls from the ideapad_acpi kernel module.'),
        });
        controlsPage.add(ideapadGroup);

        for (const ctrl of CONTROL_DEFS.filter(c => c.module === 'ideapad')) {
            const row = new Adw.SwitchRow({
                title: _(ctrl.name),
                subtitle: _(`Show "${ctrl.name}" in the menu`),
            });

            // Bind to GSettings: true = visible (default)
            settings.bind(
                `show-${ctrl.id.replace(/_/g, '-')}`,
                row, 'active',
                Gio.SettingsBindFlags.DEFAULT
            );
            ideapadGroup.add(row);
        }

        // --- Legion Group ---
        const legionGroup = new Adw.PreferencesGroup({
            title: _('Legion Controls'),
            description: _('Toggle visibility of controls from the LenovoLegionLinux kernel module.'),
        });
        controlsPage.add(legionGroup);

        for (const ctrl of CONTROL_DEFS.filter(c => c.module === 'legion')) {
            const row = new Adw.SwitchRow({
                title: _(ctrl.name),
                subtitle: _(`Show "${ctrl.name}" in the menu`),
            });

            settings.bind(
                `show-${ctrl.id.replace(/_/g, '-')}`,
                row, 'active',
                Gio.SettingsBindFlags.DEFAULT
            );
            legionGroup.add(row);
        }

        // --- Top Bar Group ---
        const topBarGroup = new Adw.PreferencesGroup({
            title: _('Top Bar'),
            description: _('Show/hide the indicator and choose the top bar icon.'),
        });
        controlsPage.add(topBarGroup);

        const showTopBarRow = new Adw.SwitchRow({
            title: _('Show Top Bar Indicator'),
            subtitle: _('Hide only the panel icon without changing menu style.'),
        });
        settings.bind(
            'show-top-bar-icon',
            showTopBarRow, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        topBarGroup.add(showTopBarRow);

        const showQuickSettingsRow = new Adw.SwitchRow({
            title: _('Show Quick Settings Entry'),
            subtitle: _('Show GnomeVantage tile in GNOME Quick Settings.'),
        });
        settings.bind(
            'show-quick-settings-entry',
            showQuickSettingsRow, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        topBarGroup.add(showQuickSettingsRow);

        const showQuickSettingsActiveStateRow = new Adw.SwitchRow({
            title: _('Highlight Active Tile'),
            subtitle: _('Show the tile as active when Legion support is detected.'),
        });
        settings.bind(
            'show-quick-settings-active-state',
            showQuickSettingsActiveStateRow, 'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        topBarGroup.add(showQuickSettingsActiveStateRow);

        const iconModel = new Gtk.StringList();
        for (const choice of PANEL_ICON_CHOICES)
            iconModel.append(_(choice.label));

        const iconRow = new Adw.ComboRow({
            title: _('Top Bar Icon'),
            subtitle: _('Select the icon shown in the top bar.'),
            model: iconModel,
        });

        const currentIcon = settings.get_string('panel-icon-name');
        const currentIconIndex = PANEL_ICON_CHOICES.findIndex(c => c.icon === currentIcon);
        iconRow.selected = currentIconIndex >= 0 ? currentIconIndex : 0;

        iconRow.connect('notify::selected', () => {
            const idx = Number(iconRow.selected);
            if (idx >= 0 && idx < PANEL_ICON_CHOICES.length)
                settings.set_string('panel-icon-name', PANEL_ICON_CHOICES[idx].icon);
        });
        topBarGroup.add(iconRow);

        // =============================================
        // Page 2: Setup Instructions
        // =============================================
        const setupPage = new Adw.PreferencesPage({
            title: _('Setup'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(setupPage);

        // --- Password-less operation ---
        const noRootGroup = new Adw.PreferencesGroup({
            title: _('Password-less Operation'),
            description: _('By default, sysfs files are only writeable by root. Install the service once to enable automatic password-less toggling.'),
        });
        setupPage.add(noRootGroup);

        const installRow = new Adw.ActionRow({
            title: _('One-click Setup'),
            subtitle: _('Downloads the systemd service from GitHub and installs it with administrator privileges.'),
        });

        const installButton = new Gtk.Button({
            label: _('Install Now'),
            valign: Gtk.Align.CENTER,
        });
        installButton.add_css_class('suggested-action');
        installButton.connect('clicked', () => {
            this._installPasswordlessService(installRow, installButton);
        });
        installRow.add_suffix(installButton);
        noRootGroup.add(installRow);

        const cmdRow = new Adw.ActionRow({
            title: _('Automatic Setup Command'),
            subtitle: `sudo sh -c '${this._getPasswordlessSetupCommand()}'`,
            activatable: true,
        });
        cmdRow.add_suffix(new Gtk.Image({
            icon_name: 'terminal-symbolic',
            valign: Gtk.Align.CENTER,
        }));

        const setupCommand = cmdRow.subtitle;
        cmdRow.connect('activated', () => {
            const clipboard = Gdk.Display.get_default().get_clipboard();
            if (clipboard.set_text)
                clipboard.set_text(setupCommand);
            else
                clipboard.set(setupCommand);
            cmdRow.subtitle = _('Command copied to clipboard');
        });

        noRootGroup.add(cmdRow);

        // --- Requirements ---
        const reqGroup = new Adw.PreferencesGroup({
            title: _('Requirements'),
            description: _('This extension requires specific kernel modules to be loaded.'),
        });
        setupPage.add(reqGroup);

        const ideapadRow = new Adw.ActionRow({
            title: _('ideapad_acpi'),
            subtitle: _('Included in mainline Linux kernel. Provides Fn Lock, Battery Conservation, and USB Charging.'),
        });
        reqGroup.add(ideapadRow);

        const legionRow = new Adw.ActionRow({
            title: _('LenovoLegionLinux'),
            subtitle: _('Community kernel module. Provides Super Key, Touchpad, Fast Charge, Overdrive, and Hybrid GPU.'),
        });
        legionRow.add_suffix(new Gtk.LinkButton({
            uri: 'https://github.com/johnfanv2/LenovoLegionLinux',
            label: _('GitHub'),
            valign: Gtk.Align.CENTER,
        }));
        reqGroup.add(legionRow);

        // =============================================
        // Page 3: About
        // =============================================
        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const aboutGroup = new Adw.PreferencesGroup({
            title: 'GnomeVantage',
            description: _('Control features of your Lenovo Legion or Ideapad laptop.\n\nGNOME port by unaibenidorm.\nBased on PlasmaVantage by Scias and LenovoLegionLinux by johnfanv2.\nLicensed under Mozilla Public License 2.0.'),
        });
        aboutPage.add(aboutGroup);

        const versionRow = new Adw.ActionRow({
            title: _('Version'),
            subtitle: '1.0',
        });
        aboutGroup.add(versionRow);

        const urlRow = new Adw.ActionRow({
            title: _('Homepage'),
        });
        urlRow.add_suffix(new Gtk.LinkButton({
            uri: 'https://github.com/unaibenidorm/gnomevantage',
            label: 'GitHub',
            valign: Gtk.Align.CENTER,
        }));
        aboutGroup.add(urlRow);
    }
}
