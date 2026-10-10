"""Small dependency-free debug APK build using official Android SDK build tools.
Usage: python build.py --sdk-tools PATH --android-jar PATH [--jdk PATH]
No global settings, SDK licenses, firmware or phone installations are changed.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import zipfile
import tempfile

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--sdk-tools',required=True,type=Path)
parser.add_argument('--android-jar',required=True,type=Path)
parser.add_argument('--jdk',type=Path,default=Path(os.environ.get('JAVA_HOME','C:/Program Files/Java/jdk-21')))
args=parser.parse_args()
build=root/'build'; build.mkdir(exist_ok=True)
classes=build/'classes'; classes.mkdir(exist_ok=True)
dex=build/'dex';dex.mkdir(exist_ok=True)
keys=root/'.keys';keys.mkdir(exist_ok=True)
def run(*cmd):subprocess.run([str(x) for x in cmd],check=True,cwd=root)
java=args.jdk/'bin/java.exe'; javac=args.jdk/'bin/javac.exe'
sources=list((root/'app/src/main/java').rglob('*.java'))
argfile=build/'sources.txt'
argfile.write_text('\n'.join('"'+str(p).replace('\\','/')+'"' for p in sources),encoding='utf-8')
bootclasspath=os.pathsep.join(map(str,[args.sdk_tools/'core-lambda-stubs.jar',args.android_jar]))
run(javac,'-encoding','UTF-8','-source','8','-target','8','-bootclasspath',bootclasspath,'-d',classes,'@'+str(argfile))
jar=build/'classes.jar'
with zipfile.ZipFile(jar,'w',zipfile.ZIP_DEFLATED) as z:
    for p in classes.rglob('*.class'):z.write(p,p.relative_to(classes).as_posix())
run(java,'-cp',args.sdk_tools/'lib/d8.jar','com.android.tools.r8.D8','--min-api','26','--lib',args.android_jar,'--output',dex,jar)
apk=build/'unsigned.apk'
stage=Path(tempfile.mkdtemp(prefix='haneulmaru-apk-'))
shutil.copy2(args.android_jar,stage/'android.jar')
shutil.copy2(root/'app/src/main/AndroidManifest.xml',stage/'AndroidManifest.xml')
shutil.copy2(args.sdk_tools/'aapt2.exe',stage/'aapt2.exe')
shutil.copytree(root/'app/src/main/res',stage/'res')
subprocess.run([str(stage/'aapt2.exe'),'compile','--dir','res','-o','resources.zip'],cwd=stage,check=True)
subprocess.run([str(stage/'aapt2.exe'),'link','-I','android.jar','--manifest','AndroidManifest.xml','-o','unsigned.apk','resources.zip'],cwd=stage,check=True)
shutil.copy2(stage/'unsigned.apk',apk)
with zipfile.ZipFile(apk,'a',zipfile.ZIP_DEFLATED) as z:z.write(dex/'classes.dex','classes.dex')
aligned=build/'aligned.apk'
run(args.sdk_tools/'zipalign.exe','-f','4','build/unsigned.apk','build/aligned.apk')
key=keys/'debug.jks'
if not key.exists():run(args.jdk/'bin/keytool.exe','-genkeypair','-keystore',key,'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Haneulmaru Debug,O=Local,C=KR')
output=root/'dist/haneulmaru-v53-lan.apk';output.parent.mkdir(exist_ok=True)
run(java,'-jar',args.sdk_tools/'lib/apksigner.jar','sign','--ks',key,'--ks-pass','pass:android','--key-pass','pass:android','--out',output,aligned)
run(java,'-jar',args.sdk_tools/'lib/apksigner.jar','verify','--verbose',output)
shutil.copy2(output,stage/'signed.apk')
badging=subprocess.run([str(stage/'aapt2.exe'),'dump','badging','signed.apk'],cwd=stage,check=True,capture_output=True)
(root/'dist/apk-info.txt').write_bytes(badging.stdout)
print('APK: '+str(output))
print('Packaging scratch directory: '+str(stage))
