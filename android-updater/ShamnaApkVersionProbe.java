package com.shamna.ai;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;

/**
 * Reads only the beginning of a published APK to discover its actual manifest
 * package/versionCode/versionName, even if the Dallalna listing has version=null.
 * This is discovery, NOT verification: Android APK signature and package identity
 * must still be validated against the installed app before any installation.
 */
public final class ShamnaApkVersionProbe {
    public static final class Version {
        public final String packageName;
        public final String versionName;
        public final long versionCode;

        Version(String pkg, String name, long code) {
            packageName = pkg;
            versionName = name;
            versionCode = code;
        }
    }

    private ShamnaApkVersionProbe() {}

    private static final int MAX_PREFIX = 262144; // at most 256 KiB per new URL
    private static final int MAX_MANIFEST = 131072;

    public static Version inspectRemote(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(16000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Range", "bytes=0-262143");
        connection.setRequestProperty("Accept-Encoding", "identity");
        connection.setRequestProperty("Cache-Control", "no-cache");
        int status = connection.getResponseCode();
        if (status != 200 && status != 206) {
            connection.disconnect();
            return null;
        }
        byte[] prefix;
        try (InputStream input = connection.getInputStream()) {
            prefix = readUpTo(input, MAX_PREFIX);
        } finally { connection.disconnect(); }
        return inspectPrefix(prefix);
    }

    private static byte[] readUpTo(InputStream input, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        while (out.size() < max) {
            int n = input.read(buffer, 0, Math.min(buffer.length, max - out.size()));
            if (n < 0) break;
            out.write(buffer, 0, n);
        }
        return out.toByteArray();
    }

    private static int u16(byte[] d, int p) {
        if (p < 0 || p > d.length-2) throw new IllegalArgumentException("out of range");
        return (d[p]&255) | ((d[p+1]&255)<<8);
    }

    private static long u32(byte[] d, int p) {
        return ((long)u16(d,p) | ((long)u16(d,p+2)<<16)) & 0xffffffffL;
    }

    private static int safeInt(long value) {
        if (value < 0 || value > Integer.MAX_VALUE) throw new IllegalArgumentException("bad integer");
        return (int)value;
    }

    public static Version inspectPrefix(byte[] zip) {
        if (zip == null || zip.length < 38) return null;
        try {
            int p = 0;
            for (int i=0; i<2048 && p + 30 <= zip.length; i++) {
                if (u32(zip,p) != 0x04034b50L) return null;
                int flags=u16(zip,p+6), method=u16(zip,p+8);
                int compressed=safeInt(u32(zip,p+18));
                int plain=safeInt(u32(zip,p+22));
                int filenameLength=u16(zip,p+26), extraLength=u16(zip,p+28);
                long payloadStart=(long)p + 30 + filenameLength + extraLength;
                if (payloadStart > zip.length) return null;
                if ((flags & 8) != 0) return null; // data-descriptor layout: fall back to GitHub
                String filename = new String(zip,p+30,filenameLength, StandardCharsets.UTF_8);
                if ("AndroidManifest.xml".equals(filename)) {
                    if (plain<100 || plain>MAX_MANIFEST
                        || (long)compressed + payloadStart > zip.length) return null;
                    byte[] manifest;
                    if (method==0) {
                        if (plain!=compressed) return null;
                        manifest = new byte[plain];
                        System.arraycopy(zip,(int)payloadStart,manifest,0,plain);
                    } else if (method==8) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        Inflater inflater = new Inflater(true);
                        try (InputStream source = new InflaterInputStream(
                                new ByteArrayInputStream(zip,(int)payloadStart,compressed),inflater)) {
                            manifest=readUpTo(source,MAX_MANIFEST+1);
                        } finally { inflater.end(); }
                        if (manifest.length!=plain) return null;
                    } else return null;
                    return parseAndroidManifest(manifest);
                }
                long next=payloadStart+compressed;
                if (next <= p || next > zip.length) return null;
                p=(int)next;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private static int length8(byte[] d,int[] p) {
        int a=d[p[0]++]&255;
        if ((a&0x80)!=0) return ((a&0x7f)<<8)|(d[p[0]++]&255);
        return a;
    }

    private static int length16(byte[] d,int[] p) {
        int a=u16(d,p[0]);p[0]+=2;
        if ((a&0x8000)!=0) {
            a=((a&0x7fff)<<16)|u16(d,p[0]);p[0]+=2;
        }
        return a;
    }

    private static String stringAt(byte[] data,int offset,boolean isUtf8) {
        int[] p={offset};
        if (isUtf8) {
            length8(data,p); // UTF-16 code units
            int byteLength=length8(data,p);
            if (byteLength<0 || p[0]+byteLength>data.length)throw new IllegalArgumentException("bad string");
            return new String(data,p[0],byteLength,StandardCharsets.UTF_8);
        } else {
            int units=length16(data,p);
            if (units<0 || units>65535 || p[0]+2*units>data.length)
                throw new IllegalArgumentException("bad UTF-16 string");
            return new String(data,p[0],units*2,StandardCharsets.UTF_16LE);
        }
    }

    private static Version parseAndroidManifest(byte[] xml) {
        if (xml.length<40 || u16(xml,0)!=0x0003) return null;
        String[] strings=null;
        String pkg=null,versionName=null;
        long code=0;
        int pos=u16(xml,2);
        try {
            for (int chunks=0;chunks<128 && pos+8<=xml.length;chunks++) {
                int type=u16(xml,pos),h=u16(xml,pos+2);
                int size=safeInt(u32(xml,pos+4));
                if (size<h || size<8 || (long)pos+size>xml.length) return null;
                if (type==0x0001) {
                    int count=safeInt(u32(xml,pos+8));
                    if (count<0 || count>5000) return null;
                    int flags=safeInt(u32(xml,pos+16));
                    int start=safeInt(u32(xml,pos+20));
                    if ((long)h+4L*count>size) return null;
                    strings=new String[count];
                    for (int i=0;i<count;i++) {
                        int offset=safeInt(u32(xml,pos+h+4*i));
                        strings[i]=stringAt(xml,pos+start+offset,(flags&256)!=0);
                    }
                } else if (type==0x0102 && strings!=null) {
                    int nameIdx=safeInt(u32(xml,pos+20));
                    if (nameIdx>=strings.length) return null;
                    if ("manifest".equals(strings[nameIdx])) {
                        int attrStart=u16(xml,pos+24),attrSize=u16(xml,pos+26),n=u16(xml,pos+28);
                        if (attrSize<20 || n>128) return null;
                        for (int i=0;i<n;i++) {
                            long attr=(long)pos+16+attrStart+(long)attrSize*i;
                            if (attr+20>pos+size) return null;
                            int a=(int)attr,attributeIdx=safeInt(u32(xml,a+4));
                            if (attributeIdx>=strings.length) return null;
                            String attribute=strings[attributeIdx];
                            int valueType=xml[a+15]&255;
                            long value=u32(xml,a+16);
                            if ("package".equals(attribute) && valueType==3) {
                                if (value>=strings.length)return null;
                                pkg=strings[(int)value];
                            } else if ("versionName".equals(attribute) && valueType==3) {
                                if (value>=strings.length)return null;
                                versionName=strings[(int)value];
                            } else if ("versionCode".equals(attribute) && valueType==0x10) {
                                code=value;
                            }
                        }
                        break;
                    }
                }
                pos+=size;
            }
        } catch (Exception ignored) { return null; }
        if (pkg==null || versionName==null || code==0) return null;
        return new Version(pkg,versionName,code);
    }
}
