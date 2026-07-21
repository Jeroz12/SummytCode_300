# ============================================================================
# Makefile — Firmware PLC para ATmega328p (Arduino Uno) con avr-gcc puro
# ----------------------------------------------------------------------------
# Compila el runtime + la HAL + el programa generado por el IDE en un único
# .hex listo para flashear. En el IDE PLC esto es automático; aquí está expuesto
# como material educativo.
#
# IMPORTANTE: las recetas (líneas debajo de cada target) usan TABULACIÓN, no
# espacios. Es un requisito de make.
# ============================================================================

# ── Configuración (ajustable) ──────────────────────────────────────────────
MCU      = atmega328p
F_CPU    = 16000000UL
BAUD     = 115200
PROG_DIR = ../../generated      # carpeta donde el IDE deposita plc_program.c
PORT     = /dev/ttyUSB0         # puerto serie (Windows: COM3)

AVRDUDE            = avrdude
AVRDUDE_PROGRAMMER = arduino

# ── Herramientas del toolchain AVR ─────────────────────────────────────────
CC      = avr-gcc
OBJCOPY = avr-objcopy
SIZE    = avr-size

# ── Fuentes y objetos ───────────────────────────────────────────────────────
SRCS = plc_runtime.c hal_avr.c main.c $(PROG_DIR)/plc_program.c
OBJS = $(SRCS:.c=.o)

TARGET = plc_firmware

# ── Flags de compilación ────────────────────────────────────────────────────
#   -Os              optimiza tamaño (crítico: solo 32 KB de Flash)
#   -ffunction/-fdata-sections  coloca cada símbolo en su propia sección para
#                    que el linker pueda descartar lo no usado (--gc-sections)
#   -I.              busca los headers (plc_runtime.h, hal_avr.h) en esta carpeta
CFLAGS = -mmcu=$(MCU) \
         -DF_CPU=$(F_CPU) \
         -Os \
         -std=c11 \
         -Wall \
         -Wextra \
         -ffunction-sections \
         -fdata-sections \
         -I.

# ── Flags de enlazado ───────────────────────────────────────────────────────
#   -Wl,--gc-sections  elimina secciones no referenciadas → binario más pequeño
LDFLAGS = -mmcu=$(MCU) \
          -Wl,--gc-sections

# ── Targets ─────────────────────────────────────────────────────────────────
all: $(TARGET).elf $(TARGET).hex

# Regla genérica: cada .c → .o con los CFLAGS del target AVR.
%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

# Enlaza todos los objetos en el ejecutable .elf.
$(TARGET).elf: $(OBJS)
	$(CC) $(LDFLAGS) $(OBJS) -o $@

# Convierte el .elf a Intel HEX (formato que entiende avrdude), sin la EEPROM.
$(TARGET).hex: $(TARGET).elf
	$(OBJCOPY) -O ihex -R .eeprom $< $@

# Flashea el .hex al MCU vía el bootloader Arduino.
flash: $(TARGET).hex
	$(AVRDUDE) -p $(MCU) -c $(AVRDUDE_PROGRAMMER) \
	           -P $(PORT) -b $(BAUD) \
	           -U flash:w:$(TARGET).hex:i

# Reporta uso de memoria: text = Flash, data + bss = RAM.
size: $(TARGET).elf
	$(SIZE) --format=avr --mcu=$(MCU) $(TARGET).elf

# Limpia los artefactos de compilación.
clean:
	rm -f $(OBJS) $(TARGET).elf $(TARGET).hex

.PHONY: all flash size clean
