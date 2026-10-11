package io.haneulmaru.v53usb;
public class LanFailureTest {
    public static void main(String[] args) {
        if(!LanFailure.http(401).contains("연결키 만료"))throw new AssertionError();
        if(!LanFailure.http(404).contains("404"))throw new AssertionError();
        Exception[] failures={new javax.net.ssl.SSLHandshakeException("secret"),new java.net.SocketTimeoutException("secret"),new java.net.NoRouteToHostException("secret"),new java.net.ConnectException("secret")};
        String[] expected={"TLS","시간 초과","경로 없음","연결 실패"};
        for(int i=0;i<failures.length;i++) {
            String result=LanFailure.describe(new java.io.IOException("secret",failures[i]));
            if(!result.contains(expected[i])||result.contains("secret"))throw new AssertionError(result);
        }
        System.out.println("LAN failure diagnostics passed");
    }
}
