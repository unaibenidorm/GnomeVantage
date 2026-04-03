/**
 * VantageManager - Hardware control manager for Lenovo Legion/Ideapad laptops
 *
 * Reads and writes sysfs parameters exposed by the LenovoLegionLinux
 * and ideapad_acpi kernel modules.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// sysfs base paths for each kernel module
const IDEAPAD_MOD_PATH = '/sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/';
const LEGION_MOD_PATH  = '/sys/bus/platform/drivers/legion/PNP0C09:00/';

/**
 * Definition of all available hardware controls.
 * Each control maps to a sysfs file under the relevant module path.
 */
export const VANTAGE_CONTROLS = [
    {
        id:     'fn_lock',
        name:   'Fn Lock',
        desc:   'Access multimedia keys without holding Fn',
        tip:    'When enabled, the multimedia functions will be accessible without having to hold the Fn key.',
        icon:   'fnlock',
        param:  'fn_lock',
        module: 'ideapad',
    },
    {
        id:     'winkey',
        name:   'Super Key',
        desc:   'Enables the Super/Windows key',
        tip:    'Whether to enable or not the Super (Windows) key.',
        icon:   'superkey',
        param:  'winkey',
        module: 'legion',
    },
    {
        id:     'touchpad',
        name:   'Touchpad',
        desc:   "Enables the laptop's touchpad",
        tip:    "Whether to enable or not the laptop's touchpad.",
        icon:   'touchpad',
        param:  'touchpad',
        module: 'legion',
    },
    {
        id:     'conservation_mode',
        name:   'Battery Conservation',
        desc:   'Limits charge to extend battery lifespan',
        tip:    'When enabled, the battery will not charge above a certain value (usually around 50-70%) in order to extend its lifespan.',
        icon:   'batsave',
        param:  'conservation_mode',
        module: 'ideapad',
    },
    {
        id:     'rapidcharge',
        name:   'Fast Charge',
        desc:   'Allows the battery to charge faster',
        tip:    'When enabled, allows the battery to charge faster at the cost of its lifespan.',
        icon:   'fastcharge',
        param:  'rapidcharge',
        module: 'legion',
    },
    {
        id:     'usb_charging',
        name:   'Always On USB',
        desc:   'Keeps USB ports always powered on',
        tip:    'Keeps the USB ports powered on even if the laptop is suspended.',
        icon:   'usbcharging',
        param:  'usb_charging',
        module: 'ideapad',
    },
    {
        id:     'overdrive',
        name:   'Display Overdrive',
        desc:   "Reduces the laptop's display latency",
        tip:    'Reduces the display latency in order to limit ghosting and trailing images.\nIncreases power consumption and may introduce other graphical defects.',
        icon:   'overdrive',
        param:  'overdrive',
        module: 'legion',
    },
    {
        id:     'gsync',
        name:   'Hybrid Graphics',
        desc:   "Enables the laptop's integrated graphics",
        tip:    "Enables the processor's integrated graphics.\nDecreases power consumption by allowing the dedicated GPU to power down and work only when necessary but slightly decreases performance.\nReboot is required to apply the change.",
        icon:   'hybrid',
        param:  'gsync',
        module: 'legion',
        reboot: true,
    },
];

export class VantageManager {
    constructor() {
        this._log('Initializing VantageManager');
    }

    /**
     * Get the sysfs base path for a given module.
     * @param {string} module - 'legion' or 'ideapad'
     * @returns {string|null}
     */
    _getModulePath(module) {
        if (module === 'legion')
            return LEGION_MOD_PATH;
        else if (module === 'ideapad')
            return IDEAPAD_MOD_PATH;
        return null;
    }

    /**
     * Check if a sysfs path exists (i.e. the kernel module is loaded).
     * @param {string} module - 'legion' or 'ideapad'
     * @returns {boolean}
     */
    isModuleAvailable(module) {
        const path = this._getModulePath(module);
        if (!path) return false;
        return GLib.file_test(path, GLib.FileTest.IS_DIR);
    }

    /**
     * Check if a specific parameter sysfs file exists.
     * @param {string} module
     * @param {string} param
     * @returns {boolean}
     */
    isParamAvailable(module, param) {
        const basePath = this._getModulePath(module);
        if (!basePath) return false;
        return GLib.file_test(basePath + param, GLib.FileTest.EXISTS);
    }

    /**
     * Read a sysfs parameter value asynchronously.
     * @param {string} module - 'legion' or 'ideapad'
     * @param {string} param  - sysfs filename
     * @returns {Promise<number>} resolves with 0 or 1, or -1 on error
     */
    readParam(module, param) {
        return new Promise((resolve) => {
            const basePath = this._getModulePath(module);
            if (!basePath) {
                resolve(-1);
                return;
            }

            const filePath = basePath + param;
            this._log(`Reading: ${filePath}`);

            try {
                const file = Gio.File.new_for_path(filePath);
                file.load_contents_async(null, (source, result) => {
                    try {
                        const [ok, contents] = source.load_contents_finish(result);
                        if (ok) {
                            const value = parseInt(new TextDecoder().decode(contents).trim(), 10);
                            this._log(`Read ${param} = ${value}`);
                            resolve(isNaN(value) ? -1 : value);
                        } else {
                            this._log(`Failed to read ${param}`);
                            resolve(-1);
                        }
                    } catch (e) {
                        this._log(`Error reading ${param}: ${e.message}`);
                        resolve(-1);
                    }
                });
            } catch (e) {
                this._log(`Error opening ${filePath}: ${e.message}`);
                resolve(-1);
            }
        });
    }

    /**
     * Write a value to a sysfs parameter. Attempts direct write first,
     * falls back to pkexec if permission is denied.
     * @param {string} module - 'legion' or 'ideapad'
     * @param {string} param  - sysfs filename
     * @param {number} value  - 0 or 1
     * @returns {Promise<boolean>} resolves true on success
     */
    writeParam(module, param, value) {
        return new Promise((resolve) => {
            const basePath = this._getModulePath(module);
            if (!basePath) {
                resolve(false);
                return;
            }

            const filePath = basePath + param;
            this._log(`Writing ${value} to ${filePath}`);

            // Try direct write first
            this._tryDirectWrite(filePath, value).then(success => {
                if (success) {
                    resolve(true);
                } else {
                    // Fallback: use pkexec
                    this._log('Permission denied, retrying with pkexec...');
                    this._tryPkexecWrite(filePath, value).then(resolve);
                }
            });
        });
    }

    /**
     * Attempt to write directly to a sysfs file.
     * @param {string} filePath
     * @param {number} value
     * @returns {Promise<boolean>}
     */
    _tryDirectWrite(filePath, value) {
        return new Promise((resolve) => {
            try {
                const file = Gio.File.new_for_path(filePath);
                const stream = file.replace(null, false,
                    Gio.FileCreateFlags.NONE, null);
                const data = new TextEncoder().encode(`${value}\n`);
                stream.write_all(data, null);
                stream.close(null);
                this._log(`Direct write success: ${filePath} = ${value}`);
                resolve(true);
            } catch (e) {
                this._log(`Direct write failed: ${e.message}`);
                resolve(false);
            }
        });
    }

    /**
     * Write using pkexec for elevated privileges.
     * @param {string} filePath
     * @param {number} value
     * @returns {Promise<boolean>}
     */
    _tryPkexecWrite(filePath, value) {
        return new Promise((resolve) => {
            try {
                const proc = Gio.Subprocess.new(
                    ['pkexec', 'sh', '-c', `echo ${value} > ${filePath}`],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );

                proc.communicate_utf8_async(null, null, (source, result) => {
                    try {
                        const [, stdout, stderr] = source.communicate_utf8_finish(result);
                        if (proc.get_successful()) {
                            this._log(`pkexec write success: ${filePath} = ${value}`);
                            resolve(true);
                        } else {
                            this._log(`pkexec write failed: ${stderr}`);
                            resolve(false);
                        }
                    } catch (e) {
                        this._log(`pkexec error: ${e.message}`);
                        resolve(false);
                    }
                });
            } catch (e) {
                this._log(`Failed to spawn pkexec: ${e.message}`);
                resolve(false);
            }
        });
    }

    /**
     * Request system reboot via D-Bus (org.gnome.SessionManager).
     */
    requestReboot() {
        try {
            const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null);
            bus.call(
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager',
                'org.gnome.SessionManager',
                'Reboot',
                null,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                null
            );
        } catch (e) {
            this._log(`Reboot request failed: ${e.message}`);
        }
    }

    _log(msg) {
        console.log(`[GnomeVantage] ${msg}`);
    }

    destroy() {
        this._log('VantageManager destroyed');
    }
}
