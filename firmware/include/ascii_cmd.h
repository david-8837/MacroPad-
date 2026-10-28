/*
 * ascii_cmd.h — the host's line protocol, as the desktop app actually sends it.
 *
 * The binary frame protocol in protocol.h is the transport for configuration and
 * telemetry. But the app's screen controls are plain text lines over the same
 * CDC port (`OLED:NEXT`, `OLED:MODE:3`, `OLED:AUTO:30`, `OLED:PL:5`, `OLED:CH:2`),
 * because they are short, human-readable in a serial terminal, and cheap to type
 * while debugging. Those lines have to be understood somewhere, so they are
 * understood here rather than being silently discarded by the frame parser.
 *
 * ── How the two protocols share one stream ────────────────────────────────
 * A binary frame always starts with 0xA5, which is not printable ASCII, and a
 * command line is entirely printable. So the RX path can tell them apart with one
 * test: while the frame parser is hunting for a start-of-frame byte, printable
 * bytes belong to a command line; everything else goes to the parser. See
 * usb_proto.c's RX loop and protocol_parser_hunting().
 *
 * Anything unrecognised is dropped without a reply. Replying to every line would
 * mean replying to the echo of what the app just sent, which turns a typo into a
 * flood of error frames.
 */
#ifndef ASCII_CMD_H
#define ASCII_CMD_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Longest line accepted, excluding the terminator. Longer input is truncated
 * and then dropped: a stuck sender must not grow a buffer on a 264 kB device. */
#define ASCII_CMD_MAX 40

/* Clear any half-received line. Call on connect and on error. */
void ascii_cmd_reset(void);

/* Feed one received byte. Returns true when it completed a line, whether or not
 * the line was understood. */
bool ascii_cmd_feed(uint8_t byte);

/* Handle one already-assembled line (no newline). Exposed so the host tests can
 * drive the parser without pretending to be a USB stack. Returns true if the
 * line was a command this firmware acts on. */
bool ascii_cmd_handle(const char *line);

#endif /* ASCII_CMD_H */
