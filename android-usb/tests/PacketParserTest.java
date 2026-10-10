package io.haneulmaru.v53usb;
import java.nio.charset.StandardCharsets;
import java.util.*;
public class PacketParserTest {
    public static void main(String[] args) {
        PacketParser p=new PacketParser();
        byte[] first="{\"v\":".getBytes(StandardCharsets.UTF_8);
        if(!p.feed(first,first.length).isEmpty())throw new AssertionError("fragment emitted");
        byte[] rest="1}\r\n{\"v\":2}\n".getBytes(StandardCharsets.UTF_8);
        if(!p.feed(rest,rest.length).equals(Arrays.asList("{\"v\":1}","{\"v\":2}")))throw new AssertionError("fragments/coalescing");
        byte[] bad=new byte[2000];Arrays.fill(bad,(byte)'x');p.feed(bad,bad.length);
        byte[] recover="ignored\n{}\n".getBytes(StandardCharsets.UTF_8);
        if(!p.feed(recover,recover.length).equals(Arrays.asList("{}")))throw new AssertionError("overflow recovery");
        System.out.println("PacketParser: fragmentation, multi-line, CRLF, overflow recovery PASS");
    }
}
