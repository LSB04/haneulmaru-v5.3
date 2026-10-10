package io.haneulmaru.v53usb;

import android.hardware.usb.*;
import java.io.IOException;

/** Native USB CDC ACM only. No board writes or firmware changes. */
public final class CdcPort implements AutoCloseable {
    private final UsbDeviceConnection connection;
    private final UsbInterface control, data;
    private final UsbEndpoint input;
    public static boolean supports(UsbDevice device) {
        boolean ctl=false,dat=false;
        for(int i=0;i<device.getInterfaceCount();i++) {
            int c=device.getInterface(i).getInterfaceClass();
            ctl|=c==UsbConstants.USB_CLASS_COMM;
            dat|=c==UsbConstants.USB_CLASS_CDC_DATA;
        }
        return ctl&&dat;
    }
    public CdcPort(UsbManager manager, UsbDevice device) throws IOException {
        UsbInterface ctl=null,dat=null; UsbEndpoint ep=null;
        for(int i=0;i<device.getInterfaceCount();i++) {
            UsbInterface item=device.getInterface(i);
            if(item.getInterfaceClass()==UsbConstants.USB_CLASS_COMM && ctl==null) ctl=item;
            if(item.getInterfaceClass()==UsbConstants.USB_CLASS_CDC_DATA && dat==null) {
                for(int j=0;j<item.getEndpointCount();j++) {
                    UsbEndpoint e=item.getEndpoint(j);
                    if(e.getType()==UsbConstants.USB_ENDPOINT_XFER_BULK && e.getDirection()==UsbConstants.USB_DIR_IN) {dat=item;ep=e;break;}
                }
            }
        }
        if(ctl==null||dat==null||ep==null) throw new IOException("USB CDC 데이터 인터페이스가 없습니다.");
        control=ctl;data=dat;input=ep;
        connection=manager.openDevice(device);
        if(connection==null) throw new IOException("USB 접근 권한 또는 연결을 확인하세요.");
        try {
            if(!connection.claimInterface(control,true)||!connection.claimInterface(data,true)) throw new IOException("USB 인터페이스 사용 중");
            byte[] coding={(byte)0x00,(byte)0xc2,0x01,0x00,0x00,0x00,0x08}; // 115200, 8N1
            if(connection.controlTransfer(0x21,0x20,0,control.getId(),coding,7,1000)!=7) throw new IOException("CDC line coding 실패");
            if(connection.controlTransfer(0x21,0x22,1,control.getId(),null,0,1000)<0) throw new IOException("CDC DTR 실패");
        } catch(IOException e) {close();throw e;}
    }
    public int read(byte[] buffer) {return connection.bulkTransfer(input,buffer,buffer.length,200);}
    public void close() {
        connection.releaseInterface(data);connection.releaseInterface(control);connection.close();
    }
}
