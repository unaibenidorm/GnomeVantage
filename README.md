# GnomeVantage for GNOME Shell 45+

> GNOME port by unaibenidorm, based on [PlasmaVantage](https://gitlab.com/Scias/plasmavantage) by Scias (KDE Plasma 6)

This GNOME Shell extension allows you to easily control features of your Lenovo Legion or Ideapad laptop series such as battery fast charging, conservation mode, hybrid graphics and more that are exposed by the [LenovoLegionLinux](https://github.com/johnfanv2/LenovoLegionLinux) and Ideapad kernel modules.

This is meant to offer an alternative to the official, proprietary and Windows-only Lenovo Vantage.

## Features

- **Panel indicator** with a dropdown menu showing all available controls
- **Toggle switches** for each hardware feature with live sysfs status
- **Automatic module detection** (only shows controls for loaded kernel modules)
- **Password-less operation** via included systemd service
- **Desktop notifications** when toggling settings
- **Reboot dialog** for settings that require a restart (e.g. hybrid GPU)
- **Preferences window** to customize visible controls, top bar icon, and quick settings entry
- **Quick Settings button** labeled Vantage that opens the same control menu
- **Original plasmoid auto icon mode** (dark theme uses plasmoid light, light theme uses plasmoid)

## Controls

| Control | Module | Description |
| --- | --- | --- |
| Fn Lock | ideapad_acpi | Access multimedia keys without holding Fn |
| Super Key | legion | Enable/disable the Super (Windows) key |
| Touchpad | legion | Enable/disable the laptop's touchpad |
| Battery Conservation | ideapad_acpi | Limit charge to extend battery lifespan |
| Fast Charge | legion | Allow the battery to charge faster |
| Always On USB | ideapad_acpi | Keep USB ports powered when suspended |
| Display Overdrive | legion | Reduce display latency (ghosting) |
| Hybrid Graphics | legion | Enable integrated GPU (requires reboot) |

## Requirements

- **GNOME Shell** 45, 46, 47, 48, 49, or 50
- [LenovoLegionLinux](https://github.com/johnfanv2/LenovoLegionLinux) kernel module (for Legion controls)
- Ideapad kernel module (included in mainline Linux, for Ideapad controls)

## Installation

### From ZIP

```bash
# Compile schemas
glib-compile-schemas gnomevantage@unaibenidorm/schemas/

# Install
gnome-extensions install gnomevantage@unaibenidorm.zip

# Enable
gnome-extensions enable gnomevantage@unaibenidorm
```

### Manual

```bash
# Copy to extensions directory
cp -r gnomevantage@unaibenidorm ~/.local/share/gnome-shell/extensions/

# Compile schemas
glib-compile-schemas ~/.local/share/gnome-shell/extensions/gnomevantage@unaibenidorm/schemas/

# Restart GNOME Shell (X11: Alt+F2 → r → Enter; Wayland: log out/in)
# Enable
gnome-extensions enable gnomevantage@unaibenidorm
```

## Password-less Operation

By default, sysfs files are only writeable by root. If you want automatic password-less operation, run this setup command once:

```bash
sudo sh -c 'curl -fsSL https://raw.githubusercontent.com/unaibenidorm/GnomeVantage/master/util/gnomevantage-noroot.service -o /etc/systemd/system/gnomevantage-noroot.service && systemctl daemon-reload && systemctl enable --now gnomevantage-noroot.service'
```

## Preferences

Open the preferences window to customize which controls appear in the menu:

```bash
gnome-extensions prefs gnomevantage@unaibenidorm
```

In the Setup page, clicking the **Automatic Setup Command** row copies the command to your clipboard.

## Disclaimer

- This is just a hobby project and is **NOT AFFILIATED WITH LENOVO IN ANY WAY**.
- This extension uses sysfs interfaces provided by LenovoLegionLinux and ideapad modules. Since these interfaces were discovered through reverse engineering, **THIS COMES WITH NO WARRANTY AND SHOULD BE USED AT YOUR OWN RISK**.

## License

Mozilla Public License 2.0.

## Credits

- Original [PlasmaVantage](https://gitlab.com/Scias/plasmavantage) by Scias
- [LenovoLegionLinux](https://github.com/johnfanv2/LenovoLegionLinux) by johnfanv2 and contributors
- Some icons are derivative work from [SVGRepo](https://www.svgrepo.com)
