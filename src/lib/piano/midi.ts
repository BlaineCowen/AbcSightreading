/**
 * A MIDI keyboard, through the browser's Web MIDI (Chrome, Edge, Firefox;
 * not Safari, on any device). Every key down and up from every connected
 * keyboard, stamped on the performance.now() clock - the event's own
 * timeStamp, which is when the message arrived, not when the handler ran.
 * A keyboard plugged in after connecting is picked up as it appears.
 */

export interface MidiKey {
  midi: number;
  velocity: number;
  down: boolean;
  /** ms, on the performance.now() clock. */
  t: number;
}

export interface MidiConnection {
  /** The keyboards connected now, by name. */
  inputs(): string[];
  stop(): void;
}

export const midiSupported = () => typeof navigator !== "undefined" && typeof (navigator as any).requestMIDIAccess === "function";

/**
 * Ask for MIDI and listen. Throws with a reader's explanation when the
 * browser has none, or the person said no.
 */
export async function connectMidi(onKey: (k: MidiKey) => void, onChange: (names: string[]) => void = () => {}): Promise<MidiConnection> {
  if (!midiSupported()) throw new Error("This browser cannot read a MIDI keyboard. Chrome or Edge on a computer can.");
  let access: any;
  try {
    access = await (navigator as any).requestMIDIAccess({ sysex: false });
  } catch {
    throw new Error("The browser was not allowed to use MIDI. Allow it in the address bar's site settings, and try again.");
  }
  const handle = (e: any) => {
    const [status, note, velocity] = e.data as Uint8Array;
    const kind = status & 0xf0;
    const t = typeof e.timeStamp === "number" && e.timeStamp > 0 ? e.timeStamp : performance.now();
    if (kind === 0x90 && velocity > 0) onKey({ midi: note, velocity, down: true, t });
    else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) onKey({ midi: note, velocity: 0, down: false, t });
  };
  const names = () => [...access.inputs.values()].map((i: any) => i.name || "MIDI keyboard");
  const attach = () => {
    for (const input of access.inputs.values()) input.onmidimessage = handle;
    onChange(names());
  };
  attach();
  access.onstatechange = attach;
  return {
    inputs: names,
    stop() {
      access.onstatechange = null;
      for (const input of access.inputs.values()) input.onmidimessage = null;
    },
  };
}
