package io.haneulmaru.v53usb;

/** No exception messages or session keys are displayed. */
final class LanFailure {
    static String http(int code) {
        if(code==401)return "연결키 만료 · PC의 새 QR로 다시 연결";
        if(code==403)return "서버가 접속 거부 (403) · 로컬망/연결키 확인";
        if(code==404)return "V5.3 서버 주소가 아님 (404) · PC에서 V5.3 재실행";
        return "서버 응답 오류 (HTTP "+code+")";
    }
    static String describe(Exception error) {
        for(Throwable e=error;e!=null;e=e.getCause()) {
            if(e instanceof javax.net.ssl.SSLException)return "TLS 인증 실패 · 이 PC의 최신 V5.3 앱/휴대폰 날짜 확인";
            if(e instanceof java.net.SocketTimeoutException)return "접속 시간 초과 · 핫스팟 연결 후 PC 서버 재실행 / IP·방화벽 확인";
            if(e instanceof java.net.NoRouteToHostException)return "PC 경로 없음 · 노트북이 이 휴대폰 핫스팟에 연결됐는지 확인";
            if(e instanceof java.net.ConnectException)return "PC 연결 실패 · 서버 실행 / QR의 IP·포트·방화벽 확인";
        }
        return "로컬 접속 실패 ("+error.getClass().getSimpleName()+") · PC 서버/IP 확인";
    }
}
