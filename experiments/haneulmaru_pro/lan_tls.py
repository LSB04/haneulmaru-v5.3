"""Private-LAN TLS. The Android APK trusts only this installation's public CA.

Keys remain in .local-tls (never in an APK or Git). No network service is used
to issue or verify certificates. Address discovery does not contact the WAN.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import ipaddress, json, os, socket, subprocess
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID

NETWORKS = tuple(ipaddress.ip_network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'))

def private_ipv4(value):
    try:
        address = ipaddress.IPv4Address(value)
        return any(address in net for net in NETWORKS)
    except ipaddress.AddressValueError:
        return False

def addresses():
    found=[]
    if os.name == 'nt':
        command="Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.AddressState -eq 'Preferred'} | Select-Object -ExpandProperty IPAddress | ConvertTo-Json -Compress"
        try:
            p=subprocess.run(['powershell','-NoProfile','-Command',command],capture_output=True,text=True,timeout=12,creationflags=subprocess.CREATE_NO_WINDOW)
            value=json.loads(p.stdout)
            found=[value] if isinstance(value,str) else (value or [])
        except (OSError,ValueError,subprocess.TimeoutExpired):
            pass
    try:
        found += [r[4][0] for r in socket.getaddrinfo(socket.gethostname(),None,socket.AF_INET)]
    except OSError:
        pass
    return sorted({v for v in found if private_ipv4(v)})

def _name(value):
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,value)])

def _key(path,key):
    path.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    if os.name != 'nt':path.chmod(0o600)

def ensure_ca(root):
    folder=Path(root)/'.local-tls';folder.mkdir(exist_ok=True)
    key_path=folder/'ca-key.pem';cert_path=folder/'ca-cert.pem'
    if key_path.exists() and cert_path.exists():
        return serialization.load_pem_private_key(key_path.read_bytes(),None),x509.load_pem_x509_certificate(cert_path.read_bytes())
    if key_path.exists() or cert_path.exists():
        raise ValueError('Incomplete local CA; restore .local-tls before rebuilding the app.')
    now=datetime.now(timezone.utc);key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    cert=(x509.CertificateBuilder().subject_name(_name('Haneulmaru V5.3 Local CA')).issuer_name(_name('Haneulmaru V5.3 Local CA'))
          .public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=730))
          .add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True)
          .add_extension(x509.KeyUsage(False,False,False,False,False,True,True,False,False),critical=True)
          .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()),critical=False).sign(key,hashes.SHA256()))
    _key(key_path,key);cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return key,cert

def issue_server(root,ips):
    if any(not private_ipv4(ip) for ip in ips):raise ValueError('Only private IPv4 addresses are permitted')
    key,ca=ensure_ca(root);now=datetime.now(timezone.utc)
    if now>=ca.not_valid_after_utc:raise ValueError('Local CA expired; rebuild APK with a renewed CA')
    leaf_key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    sans=[x509.IPAddress(ipaddress.ip_address(ip)) for ip in sorted(set(ips+['127.0.0.1']))]
    cert=(x509.CertificateBuilder().subject_name(_name('Haneulmaru V5.3 LAN')).issuer_name(ca.subject)
          .public_key(leaf_key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=5))
          .not_valid_after(min(now+timedelta(days=30),ca.not_valid_after_utc))
          .add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True)
          .add_extension(x509.SubjectAlternativeName(sans),critical=False)
          .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),critical=False)
          .add_extension(x509.KeyUsage(True,False,True,False,False,False,False,False,False),critical=True)
          .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(key.public_key()),critical=False).sign(key,hashes.SHA256()))
    folder=Path(root)/'.local-tls'
    _key(folder/'server-key.pem',leaf_key)
    (folder/'server-cert.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return folder/'server-cert.pem',folder/'server-key.pem'

def export_app_ca(root):
    _,ca=ensure_ca(root)
    target=Path(root)/'android-usb/app/src/main/res/raw/haneulmaru_ca.pem'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    return ca.fingerprint(hashes.SHA256()).hex()

if __name__=='__main__':
    root=Path(__file__).resolve().parents[2]
    print('APK public CA SHA256:',export_app_ca(root))
