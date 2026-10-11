package io.haneulmaru.v53usb;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Serial reads need not coincide with JSON lines. Discard oversized lines fully. */
public final class PacketParser {
    private final ByteArrayOutputStream line = new ByteArrayOutputStream();
    private boolean dropping;
    public List<String> feed(byte[] bytes, int count) {
        List<String> lines = new ArrayList<>();
        for (int i=0; i<count; i++) {
            int b=bytes[i]&255;
            if (b==10) {
                if (!dropping && line.size()>0) lines.add(new String(line.toByteArray(),StandardCharsets.UTF_8).trim());
                line.reset(); dropping=false;
            } else if (!dropping) {
                if (line.size()>=1024) {line.reset(); dropping=true;}
                else line.write(b);
            }
        }
        return lines;
    }
}
