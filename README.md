# V5.4 AR 업데이트

이 브랜치의 최신 버전은 [V5.4 폴더](V5.4/)입니다.

- [설치 및 AR 사용법](V5.4/README.md)
- [V5.4 AR APK](V5.4/android-usb/dist/haneulmaru-v54-ar.apk)
- 기존 V5.3 코드는 아래와 루트에 보존합니다.

---

# 하늘마루 V5.3

PC의 3D 합성 비행 시뮬레이션을 Android 앱으로 보고, 터치와 NU40 USB 센서로 조작하는 로컬 네트워크 프로젝트입니다. 외부 인터넷 대신 같은 Wi-Fi 또는 휴대폰 핫스팟으로 연결합니다. Wi-Fi 통신 자체는 유지해야 합니다.

## 이번 버전

- 합성 게임의 파랑 개체는 총 20개까지 생성됩니다.
- 빨강 개체 1개가 제거되면 파랑 개체도 1개 소모됩니다.
- PC와 휴대폰에서 파랑·빨강·초록을 선택해 생성할 수 있습니다. 파랑이 20개면 파랑 생성 버튼이 비활성화됩니다.
- 전체 3D 확대·축소와 센서 시점을 함께 사용할 수 있습니다. 확대/축소 버튼도 제공합니다.
- 드론 추적·탑승 시점, 전체 3D, 2D 지도, 휴대폰 가로/세로 화면을 지원합니다.
- 실제 탐지 결과와 분리된 합성 객체 게임입니다.

## 구조

| 구성 | 역할 |
| --- | --- |
| PC 웹 렌더러 | Three.js/WebGL로 지형과 합성 객체 렌더링 |
| 영상 연결 | WebCodecs H.264 → 로컬 TLS WebSocket → Android WebView 디코더 |
| 조작 연결 | 영상과 분리된 WebSocket으로 터치·센서 상태 전달 |
| Android 앱 | 영상 표시, 터치 조작, USB CDC의 NU40 센서 수신 |
| Local + CLIKA | PC의 ClikaRT 0.6.4와 Qwen/Qwen3.5-2B로 자연어 장면 설정 |

모델 추론은 PC에서 실행됩니다. 휴대폰은 모델을 실행하지 않습니다. WebCodecs를 지원하지 않는 기기는 WebRTC 또는 JPEG 호환 연결을 사용할 수 있습니다.

## PC 설치와 실행

Windows, Python 3.12, 하드웨어 가속이 켜진 Chrome이 필요합니다. 첫 설치와 모델 다운로드에는 인터넷이 필요합니다.

```powershell
git clone https://github.com/LSB04/haneulmaru-v5.3.git
cd haneulmaru-v5.3
powershell -NoProfile -ExecutionPolicy Bypass -File .\모델_설치.ps1
```

설치 전에 본인의 CLIKA 프로젝트에서 Windows Python 3.12용 ClikaRT 0.6.4 wheel을 내려받아야 합니다. 기본 파일명은 `Downloads/clika_runtime-0.6.4-cp312-cp312-win_amd64.whl`입니다. 다른 경로는 `모델_설치.ps1 -Wheel 경로`로 지정합니다. 라이선스는 본인에게 발급된 파일을 `Downloads/Default_Project_license.txt`에 두거나 `CLIKA_RT_LICENSE` 환경변수로 경로를 지정합니다.

모델 가중치는 Git에 포함하지 않습니다. `download_model.py`가 `model-selection.json`에 고정된 리비전의 파일을 다운로드하고 SHA-256을 확인합니다. 약 4.6 GB의 저장 공간이 추가로 필요합니다.

1. `하늘마루_실행.cmd`를 실행합니다.
2. 최초 한 번 `로컬망_방화벽.ps1`을 실행하고 관리자 허용을 완료합니다.
3. PC 화면은 `http://127.0.0.1:8800/host`입니다. 휴대폰 HTTPS 8801, APK 다운로드 8802, 영상 WSS 8803을 사용합니다.
4. 휴대폰과 PC를 같은 로컬망에 연결한 뒤 최신 QR의 전체 주소를 앱에 입력합니다.
5. `로컬 연결` → `PC 연결 시작`을 누릅니다. NU40을 사용할 때는 `USB 연결`도 누릅니다.
6. PC 렌더러 창을 화면에 열어 둡니다. 네트워크 변경 시 서버를 재시작해 IP와 QR을 갱신합니다.

종료는 `종료_V5.3.ps1` 또는 서버 콘솔에서 Ctrl+C입니다.

## 다른 PC에서 사용할 Android 앱

**동봉 APK는 원래 제작 PC의 공개 CA 인증서를 신뢰합니다. 새 PC에서 생성되는 인증서는 다르므로, 새 PC용 CA를 포함해 앱을 다시 빌드해야 합니다.** 기존 APK만 설치해서 새 PC 서버에 바로 연결되는 배포판은 아닙니다.

개인 인증서 키를 공유하거나 인증서 검증을 끄지 않습니다. Android SDK Build Tools, Android 35 SDK와 JDK를 준비한 뒤 새 PC에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe experiments/haneulmaru_pro/lan_tls.py
.\.venv\Scripts\python.exe android-usb/build.py --sdk-tools "C:/Android/Sdk/build-tools/35.0.0" --android-jar "C:/Android/Sdk/platforms/android-35/android.jar" --jdk "C:/Program Files/Java/jdk-21"
```

경로는 실제 설치 위치로 바꿉니다. 첫 명령은 해당 PC의 CA를 만들고 공개 인증서를 앱 리소스에 넣습니다. 두 번째 명령은 `android-usb/dist/haneulmaru-v53-lan.apk`를 생성합니다. 기존 앱과 서명키가 다르면 기존 앱을 제거하고 새 APK를 설치해야 합니다(앱 설정은 지워집니다).

## 검증과 한계

- JavaScript 회귀 검사 38개 통과 후 초기화 수량 보완 관련 검사 14개 재통과.
- 실행 중 렌더러에 로컬 TLS 제어 명령을 보내 파랑 20개 제한, 색상 생성, 빨강/파랑 1:1 소모, 확대·축소, 초기화를 확인했습니다.
- 같은 PC 내부 H.264 디코더 시험에서 1080p/60 설정 약 59.2 FPS를 기록했습니다. 휴대폰 무선 구간의 실측 FPS를 의미하지 않습니다.
- 물리적 휴대폰 터치·핫스팟 성능은 해당 기기에서 추가 확인이 필요합니다.
- 영상 통신 검증과 CLIKA 모델 추론 검증은 별개입니다. 이번 영상 시험은 CLIKA 오프라인 추론 성공이나 대회 우대조건 충족을 증명하지 않습니다.

상세 비교는 `성능비교_V5.3.txt`, 변경 검증은 `검증결과_V5.3.txt`를 참고합니다. 원본 `output/`의 로그·브라우저 프로필·세션 정보는 공개하지 않습니다.

## 공개 저장소에서 제외한 파일

CLIKA 라이선스·SDK wheel, 모델 가중치, TLS 개인키, Android 서명키, 브라우저 프로필, 실행 로그와 가상환경은 제외했습니다. 서드파티 모델 정보는 `THIRD_PARTY_MODELS.txt`, Three.js 라이선스는 `experiments/haneulmaru_pro/vendor/LICENSE.txt`에 있습니다.
