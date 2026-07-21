# Compilación manual del firmware AVR

Cómo compilar y flashear el firmware **a mano** con avr-gcc. En el IDE PLC este
proceso es automático; este documento existe para entender qué hace por dentro.

## 1. Prerrequisitos

Necesitas el toolchain AVR: `avr-gcc`, `avr-libc`, `avrdude` y `make`.

- **Windows:** instalar [WinAVR](https://sourceforge.net/projects/winavr/) o
  trabajar dentro de **WSL** (`sudo apt install gcc-avr avr-libc avrdude make`).
- **Linux (Debian/Ubuntu):** `sudo apt install gcc-avr avr-libc avrdude make`
- **macOS:** `brew tap osx-cross/avr && brew install avr-gcc avrdude make`

Verifica con: `avr-gcc --version` y `avrdude -v`.

## 2. Compilar

```
cd firmware-runtime/avr
make all
```

Esto genera `plc_firmware.elf` y `plc_firmware.hex`.

> Requiere que el IDE (o tú) haya depositado `plc_program.c` en `../../generated/`
> (variable `PROG_DIR` del Makefile). Sin ese archivo, el enlace falla.

## 3. Ver uso de memoria

```
make size
```

Interpretación de las columnas:

- **text** → bytes en **Flash** (código + constantes). Límite: 32 KB.
- **data** → variables inicializadas; ocupan Flash **y** RAM (se copian al arrancar).
- **bss**  → variables a cero; ocupan solo **RAM**.
- **RAM usada ≈ data + bss**. Límite: 2 KB.

## 4. Flashear (sin el IDE)

```
make flash PORT=COM3            # Windows
make flash PORT=/dev/ttyUSB0    # Linux
make flash PORT=/dev/tty.usbmodemXXXX   # macOS
```

Usa el bootloader Arduino (`-c arduino`) a 115200 baudios. Ajusta `PORT` al de tu placa.

## 5. Limpiar

```
make clean
```

Borra `*.o`, `*.elf` y `*.hex`.

---

**Nota:** en el IDE PLC, "Compilar" y "Flashear" ejecutan exactamente estos pasos
(compilar el runtime + la HAL + el `plc_program.c` generado, y llamar a avrdude)
sin que el usuario toque la terminal.
