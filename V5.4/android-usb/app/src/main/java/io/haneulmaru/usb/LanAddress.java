package io.haneulmaru.v53usb;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/** Numeric private addresses only: no DNS lookups, public hosts, or cleartext. */
public final class LanAddress {
    public static boolean isPrivate(String host) {
        if(host==null||!host.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+"))return false;
        String[] parts=host.split("\\.");int[] n=new int[4];
        try {for(int i=0;i<4;i++){if(parts[i].length()>1&&parts[i].startsWith("0"))return false;n[i]=Integer.parseInt(parts[i]);if(n[i]>255)return false;}}
        catch(NumberFormatException e){return false;}
        return n[0]==10||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168);
    }
    public static URI parse(String text) {
        try {
            URI u=new URI(text.trim());
            // Accept both the QR payload and the HTTPS address copied from the PC.
            if("haneulmaru53".equals(u.getScheme())&&"connect".equals(u.getHost())) {
                String q=u.getRawQuery();
                if(q==null||!q.startsWith("url=")||q.contains("&")||u.getRawFragment()!=null)throw new IllegalArgumentException();
                u=new URI(URLDecoder.decode(q.substring(4),StandardCharsets.UTF_8.name()));
            }
            String key=u.getRawFragment();
            if(!"https".equals(u.getScheme())||!isPrivate(u.getHost())||u.getUserInfo()!=null||u.getPort()<1024||u.getPort()>65535||!"/phone".equals(u.getRawPath())||u.getRawQuery()!=null||key==null||!key.matches("[A-Za-z0-9_-]{20,128}"))throw new IllegalArgumentException();
            return u;
        }catch(Exception e){throw new IllegalArgumentException("Use the V5.3 private HTTPS QR link");}
    }
}
