package io.haneulmaru.v53usb;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.usb.*;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class MainActivity extends Activity {
    private static final String PERMISSION="io.haneulmaru.v53usb.USB_PERMISSION";
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService network=Executors.newSingleThreadScheduledExecutor();
    private final AtomicReference<Sample> latest=new AtomicReference<>();
    private final AtomicInteger generation=new AtomicInteger();
    private UsbManager usb;
    private volatile CdcPort port;
    private volatile boolean visible;
    private volatile Session session;
    private volatile long received=0,sent=0,bad=0,lastAck=0;
    private volatile String usbStatus="USB 미연결",netStatus="V5.3 로컬 QR 주소를 입력하세요",relayStatus="PC 센서 전송 대기";
    private EditText address;
    private TextView status;
    private LinearLayout settings,root;
    private WebView web;
    private FrameLayout frame;
    private View fullView;
    private WebChromeClient.CustomViewCallback fullCallback;
    private final Runnable display=new Runnable(){public void run(){
        if(isFinishing())return;
        Sample s=latest.get(); long age=s==null?99999:SystemClock.elapsedRealtime()-s.at;
        String sensor=age>350?"센서 대기 · 터치 사용 가능":String.format(Locale.US,"gx %.1f / gy %.1f / gz %.1f",s.json.optDouble("gx"),s.json.optDouble("gy"),s.json.optDouble("gz"));
        status.setText(usbStatus+" · USB 수신 "+received+" / PC 센서 전송 "+sent+" / 제외 "+bad+"\n"+sensor+"\n"+netStatus+"\n"+relayStatus);
        main.postDelayed(this,400);
    }};
    private static class Sample {final JSONObject json;final long at;Sample(JSONObject j){json=j;at=SystemClock.elapsedRealtime();}}
    private static class Session {
        final String base,key,sender=UUID.randomUUID().toString();
        long seq=0,lastSentAt=-1; boolean disconnected=true; volatile boolean ready=false;
        Session(String b,String k){base=b;key=k;}
    }
    private final BroadcastReceiver usbEvents=new BroadcastReceiver(){public void onReceive(Context context,Intent intent){
        if(PERMISSION.equals(intent.getAction())) {
            UsbDevice d=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            if(d!=null&&intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED,false)&&usb.hasPermission(d)&&visible) openUsb(d);
            else usbStatus="USB 권한 거부 · USB 연결을 다시 누르세요";
        } else if(UsbManager.ACTION_USB_DEVICE_DETACHED.equals(intent.getAction())) {
            UsbDevice d=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            if(d!=null&&d.getDeviceId()==activeDevice) stopUsb("USB 분리 · 터치로 계속 사용");
        }
    }};
    private int activeDevice=-1;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        usb=(UsbManager)getSystemService(USB_SERVICE);
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(9,23,33));
        root.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets x=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(x.left,x.top,x.right,x.bottom);}
            else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);
        TextView title=new TextView(this);title.setText("하늘마루 V5.3 · NU40 USB");title.setTextColor(Color.rgb(110,235,210));title.setPadding(16,8,0,8);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button toggle=button("설정 / 화면",()->settings.setVisibility(settings.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));bar.addView(toggle);root.addView(bar);
        settings=new LinearLayout(this);settings.setOrientation(LinearLayout.VERTICAL);settings.setPadding(12,0,12,4);
        address=new EditText(this);address.setSingleLine(true);address.setTextSize(13);address.setHint("https://PC내부IP:8801/phone#연결키");address.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);address.setSaveEnabled(false);address.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);settings.addView(address);
        LinearLayout controls=new LinearLayout(this);
        controls.addView(button("로컬 연결",this::connect),new LinearLayout.LayoutParams(0,-2,1));
        controls.addView(button("USB 연결",this::chooseUsb),new LinearLayout.LayoutParams(0,-2,1));
        controls.addView(button("USB 중지",()->stopUsb("USB 중지 · 터치 사용")),new LinearLayout.LayoutParams(0,-2,1));settings.addView(controls);
        status=new TextView(this);status.setTextSize(12);status.setTextColor(Color.LTGRAY);settings.addView(status);root.addView(settings);
        frame=new FrameLayout(this);root.addView(frame,new LinearLayout.LayoutParams(-1,0,1));
        web=new WebView(this);web.setBackgroundColor(Color.rgb(9,23,33));frame.addView(web,new FrameLayout.LayoutParams(-1,-1));
        WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);ws.setMediaPlaybackRequiresUserGesture(false);ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest request){Session s=session;return s==null||!sameOrigin(request.getUrl(),s.base)||!"/phone".equals(request.getUrl().getPath());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){Session s=session;if(s!=null&&sameOrigin(r.getUrl(),s.base))return null;return new WebResourceResponse("text/plain","UTF-8",403,"Local only",Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0]));}
            @Override public void onReceivedError(WebView w,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())netStatus="로컬 연결 실패 · 같은 Wi-Fi와 PC 방화벽 확인";}
            @Override public void onReceivedSslError(WebView w,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();netStatus="인증서 불일치 · 이 PC에서 빌드한 V5.3 앱인지 확인하세요";}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest r){r.deny();} // receiver needs no camera/microphone
            @Override public void onShowCustomView(View v,CustomViewCallback callback){if(fullView!=null){callback.onCustomViewHidden();return;}fullView=v;fullCallback=callback;frame.addView(v,new FrameLayout.LayoutParams(-1,-1));settings.setVisibility(View.GONE);}
            @Override public void onHideCustomView(){hideFull();}
        });
        setContentView(root);
        IntentFilter filter=new IntentFilter(PERMISSION);filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(usbEvents,filter,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(usbEvents,filter);
        if(!getPackageManager().hasSystemFeature(PackageManager.FEATURE_USB_HOST))usbStatus="이 휴대폰은 USB 호스트를 지원하지 않습니다";
        network.scheduleWithFixedDelay(this::relay,0,40,TimeUnit.MILLISECONDS);
        main.post(display);takeSharedLink(getIntent());
    }
    private Button button(String text,Runnable action){Button b=new Button(this);b.setText(text);b.setTextSize(12);b.setOnClickListener(v->action.run());return b;}
    private static boolean sameOrigin(Uri u,String base){return (u.getScheme()+"://"+u.getEncodedAuthority()).equals(base);}
    private void takeSharedLink(Intent i){if(Intent.ACTION_SEND.equals(i.getAction())){String t=i.getStringExtra(Intent.EXTRA_TEXT);if(t!=null)address.setText(t.trim());}else if(Intent.ACTION_VIEW.equals(i.getAction())&&i.getData()!=null){Uri u=i.getData();if("haneulmaru53".equals(u.getScheme())&&"connect".equals(u.getHost())){String t=u.getQueryParameter("url");if(t!=null){address.setText(t);connect();}}}}
    @Override protected void onNewIntent(Intent i){super.onNewIntent(i);takeSharedLink(i);}
    private void connect(){
        session=null;relayStatus="PC 센서 전송 대기 · 서버 확인 후 시작";
        try {
            URI u=LanAddress.parse(address.getText().toString());String key=u.getFragment();
            address.setText(u.toString());address.setSelection(0);
            ConnectivityManager manager=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
            Network wifi=null;for(Network n:manager.getAllNetworks()){NetworkCapabilities caps=manager.getNetworkCapabilities(n);if(caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)){wifi=n;break;}}
            // A Wi-Fi network without INTERNET/VALIDATED is intentionally accepted.
            if(!manager.bindProcessToNetwork(wifi))throw new IllegalStateException("Wi-Fi bind failed");
            String base=u.getScheme()+"://"+u.getRawAuthority();Session chosen=new Session(base,key);session=chosen;sent=0;lastAck=0;netStatus="로컬 HTTPS 확인 중 · "+base;
            network.execute(()->{
                HttpURLConnection c=null;
                try {
                    c=(HttpURLConnection)new URL(base+"/stream/health").openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(4000);c.setReadTimeout(4000);c.setRequestProperty("Authorization","Bearer "+key);
                    int code=c.getResponseCode();if(code!=200){if(session==chosen)netStatus=LanFailure.http(code)+"\nPC 주소: "+base;return;}
                    try(java.io.InputStream in=c.getInputStream()){byte[] bytes=new byte[512];while(in.read(bytes)>0){}}
                    main.post(()->{if(session==chosen){chosen.ready=true;web.loadUrl(base+"/phone#"+key);netStatus="로컬 서버 확인됨 · PC 연결 시작을 누르세요\nPC 주소: "+base;}});
                }catch(Exception e){if(session==chosen)netStatus=LanFailure.describe(e)+"\nPC 주소: "+base;}
                finally{if(c!=null)c.disconnect();}
            });
            ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);
        }catch(Exception e){new AlertDialog.Builder(this).setMessage("PC V5.3의 로컬 연결 주소를 넣으세요. 예: https://192.168.x.x:8801/phone#연결키. 인터넷 없는 같은 Wi-Fi 연결을 유지하세요.").setPositiveButton("확인",null).show();}
    }
    private void chooseUsb(){
        List<UsbDevice> devices=new ArrayList<>();List<String> names=new ArrayList<>();
        for(UsbDevice d:usb.getDeviceList().values())if(CdcPort.supports(d)){
            devices.add(d);names.add(String.format(Locale.US,"%s · %04x:%04x",d.getProductName()==null?"USB CDC":d.getProductName(),d.getVendorId(),d.getProductId()));
        }
        if(devices.isEmpty()){usbStatus="USB CDC 없음 · C–C 데이터 케이블/펌웨어 확인";return;}
        new AlertDialog.Builder(this).setTitle("NU40 USB 장치 선택").setItems(names.toArray(new String[0]),(dialog,which)->{
            UsbDevice d=devices.get(which);
            if(usb.hasPermission(d))openUsb(d);
            else {Intent i=new Intent(PERMISSION).setPackage(getPackageName());PendingIntent p=PendingIntent.getBroadcast(this,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);usb.requestPermission(d,p);}
        }).show();
    }
    private void openUsb(UsbDevice d){
        stopUsb("USB 여는 중"); final int token=generation.get();activeDevice=d.getDeviceId();
        new Thread(()->{
            CdcPort opened=null;
            try {
                opened=new CdcPort(usb,d);
                synchronized(this){if(token!=generation.get()||!visible){opened.close();return;}port=opened;}
                usbStatus="USB CDC 연결됨 · 115200 / 8N1";PacketParser parser=new PacketParser();byte[] bytes=new byte[4096];
                while(visible&&token==generation.get()){
                    int n=opened.read(bytes);
                    if(n>0)for(String line:parser.feed(bytes,n))try {
                        JSONObject packet=new JSONObject(line);validate(packet);
                        if(token==generation.get()){latest.set(new Sample(packet));received++;}
                    }catch(Exception ignored){bad++;}
                }
            }catch(Exception e){if(token==generation.get())usbStatus="USB 오류 · 다시 연결하세요";}
            finally {synchronized(this){if(port==opened){port=null;if(opened!=null)opened.close();}if(token==generation.get())latest.set(null);}}
        },"nu40-usb").start();
    }
    static void validate(JSONObject p)throws JSONException {
        Object v=p.get("v"),t=p.get("t_ms");
        if(!(v instanceof Number)||((Number)v).doubleValue()!=1||!(t instanceof Number))throw new JSONException("version/time");
        double stamp=((Number)t).doubleValue();if(!Double.isFinite(stamp)||stamp<0||stamp>4294967295L||stamp!=Math.floor(stamp))throw new JSONException("timestamp");
        for(String k:new String[]{"ax","ay","az","gx","gy","gz"}){Object n=p.get(k);if(!(n instanceof Number)||!Double.isFinite(((Number)n).doubleValue()))throw new JSONException("invalid axis");}
    }
    private synchronized void stopUsb(String message){generation.incrementAndGet();latest.set(null);CdcPort old=port;port=null;if(old!=null)old.close();activeDevice=-1;usbStatus=message;}
    private void relay(){
        Session s=session;if(s==null||!s.ready)return;Sample p=latest.get();long age=p==null?99999:SystemClock.elapsedRealtime()-p.at;
        boolean valid=visible&&p!=null&&age<=200;
        if(valid&&p.at==s.lastSentAt)return;
        if(!valid&&s.disconnected)return;
        HttpURLConnection c=null;
        try {
            JSONObject body=new JSONObject().put("sender",s.sender).put("seq",++s.seq);
            if(valid){body.put("sample",p.json).put("age_ms",age);s.lastSentAt=p.at;}else body.put("connected",false);
            c=(HttpURLConnection)new URL(s.base+"/stream/phone-imu").openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(1000);c.setReadTimeout(1000);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Authorization","Bearer "+s.key);c.setRequestProperty("Content-Type","application/json");
            byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);
            try(java.io.OutputStream out=c.getOutputStream()){out.write(bytes);}
            int code=c.getResponseCode();
            if(session!=s)return;
            if(code==200){try(java.io.InputStream in=c.getInputStream()){byte[] buffer=new byte[512];while(in.read(buffer)>0){}}s.disconnected=!valid;if(valid)sent++;lastAck=SystemClock.elapsedRealtime();relayStatus=valid?"PC 센서 수신 확인 · PC에서 IMU 시작":"센서 중계 중지";}
            else if(code==401||code==403){if(session==s)session=null;relayStatus="연결키 만료 · 최신 QR 주소로 다시 연결";}
            else if(code==404){if(session==s)session=null;relayStatus="PC V5.3 업데이트/재시작 필요";}
            else if(code==503)relayStatus="PC IMU 비활성화 · --no-imu 해제 필요";
            else relayStatus="센서 요청 거부 · 다른 앱 연결/데이터 확인 ("+code+")";
        }catch(Exception e){if(session==s)relayStatus="센서 전송 중단 · "+LanFailure.describe(e);}
        finally{if(c!=null)c.disconnect();}
    }
    private void hideFull(){if(fullView!=null){frame.removeView(fullView);fullView=null;fullCallback.onCustomViewHidden();fullCallback=null;}}
    @Override public void onBackPressed(){if(fullView!=null)hideFull();else if(settings.getVisibility()!=View.VISIBLE)settings.setVisibility(View.VISIBLE);else super.onBackPressed();}
    @Override protected void onStart(){super.onStart();visible=true;if(web!=null)web.onResume();}
    @Override protected void onStop(){visible=false;stopUsb("앱 비활성 · USB 연결을 눌러 재개");if(web!=null)web.onPause();super.onStop();}
    @Override protected void onDestroy(){main.removeCallbacks(display);network.shutdownNow();unregisterReceiver(usbEvents);web.destroy();super.onDestroy();}
}
