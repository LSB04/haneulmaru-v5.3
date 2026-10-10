package io.haneulmaru.v53usb;
public class LanAddressTest {
    public static void main(String[] args){
        String suffix=":8801/phone#abcdefghijklmnopqrstuvwx";
        for(String ip:new String[]{"192.168.0.129","10.0.0.3","172.16.1.2","172.31.9.3"})LanAddress.parse("https://"+ip+suffix);
        URIcheck();
        for(String bad:new String[]{"http://192.168.0.2"+suffix,"https://8.8.8.8"+suffix,"https://192.168.1.2.evil.com"+suffix,"https://127.0.0.1"+suffix,"https://192.168.01.2"+suffix,"https://172.32.1.1"+suffix,"https://user@192.168.0.2"+suffix,"https://192.168.0.2:8801/host#abcdefghijklmnopqrstuvwx","https://192.168.0.2:8801/phone#short"}){
            boolean rejected=false;try{LanAddress.parse(bad);}catch(IllegalArgumentException e){rejected=true;}
            if(!rejected)throw new AssertionError("Accepted invalid LAN URL: "+bad);
        }
        System.out.println("LAN URL validation passed");
    }
    private static void URIcheck(){
        String good="haneulmaru53://connect?url=https%3A%2F%2F192.168.0.129%3A8801%2Fphone%23abcdefghijklmnopqrstuvwx";
        if(!"192.168.0.129".equals(LanAddress.parse(good).getHost()))throw new AssertionError("QR parse failed");
        for(String bad:new String[]{good+"&url=other",good.replace("192.168.0.129","8.8.8.8"),good.replace("https%3A","http%3A")}){
            boolean rejected=false;try{LanAddress.parse(bad);}catch(IllegalArgumentException e){rejected=true;}
            if(!rejected)throw new AssertionError("Accepted invalid QR");
        }
    }
}
