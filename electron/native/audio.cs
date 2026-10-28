// Native audio interop for KADOWAZ Deck Studio.
//
// Loaded once by audio.cjs with Add-Type and called through static methods, so
// the PowerShell on the other side stays short and readable. Everything here is
// COM interop against interfaces Windows has exposed since Vista:
//
//   IMMDeviceEnumerator   – list and pick endpoints
//   IAudioEndpointVolume  – master volume and mute
//   IAudioSessionManager2 – the per-application sessions
//   IPolicyConfig         – set the default device (undocumented but stable,
//                           and the only way to do it without a UWP package)
//
// Per-app volume is the reason this file exists at all: PowerShell has no cmdlet
// for it, and every third-party option either needs a bundled binary or a
// UAC prompt. Session matching is by process id, so "the focused app" and "this
// specific app" are the same code path with a different id.

using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class KadowazAudio
{
    /* ------------------------------------------------------------ GUIDs */

    static readonly Guid IID_IMMDeviceEnumerator = new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
    static readonly Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    static readonly Guid IID_IAudioSessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    static readonly Guid IID_IPolicyConfig = new Guid("f8679f50-850a-41cf-9c72-430f290290c8");
    static readonly Guid CLSID_PolicyConfig = new Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9");

    const int eRender = 0;
    const int eCapture = 1;
    const int eAll = 2;
    const int DEVICE_STATE_ACTIVE = 1;

    /* ------------------------------------------------------ interfaces */

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
        int OpenPropertyStore(int access, out IntPtr props);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection
    {
        int GetCount(out int count);
        int Item(int index, out IMMDevice device);
    }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr p);
        int UnregisterControlChangeNotify(IntPtr p);
        int GetChannelCount(out int count);
        int SetMasterVolumeLevel(float level, ref Guid ctx);
        int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
        int GetMasterVolumeLevel(out float level);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(int channel, float level, ref Guid ctx);
        int SetChannelVolumeLevelScalar(int channel, float level, ref Guid ctx);
        int GetChannelVolumeLevel(int channel, out float level);
        int GetChannelVolumeLevelScalar(int channel, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
        int GetGroupingParam(out Guid param);
        int SetGroupingParam(ref Guid param, ref Guid ctx);
        int RegisterAudioSessionNotification(IntPtr p);
        int UnregisterAudioSessionNotification(IntPtr p);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetProcessId(out uint pid);
        int IsSystemSoundsSession();
        int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
    }

    [ComImport, Guid("C16BA19A-F0BE-4D17-A1A1-4C3EE55F1C0F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        int GetCount(out int count);
        int GetSession(int index, out IAudioSessionControl2 session);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        int GetAudioSessionControl(ref Guid guid, int chan, out IntPtr ctl);
        int GetSimpleAudioVolume(ref Guid guid, int chan, out IntPtr vol);
        int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }

    [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPolicyConfig
    {
        int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr fmt);
        int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, bool def, IntPtr fmt);
        int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id);
        int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr fmt, IntPtr mix);
        int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, bool def, IntPtr d, IntPtr m);
        int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr period);
        int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr mode);
        int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr mode);
        int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref IntPtr key, IntPtr value);
        int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, ref IntPtr key, IntPtr value);
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
        int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, bool visible);
    }

    /* -------------------------------------------------------- plumbing */

    static IMMDeviceEnumerator Enumerator()
    {
        var type = Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator);
        return (IMMDeviceEnumerator)Activator.CreateInstance(type);
    }

    static string DeviceName(IMMDevice dev)
    {
        IntPtr store;
        if (dev.OpenPropertyStore(0, out store) != 0) return "";
        try
        {
            // PKEY_Device_FriendlyName = {a45c254e-df1c-4efd-8020-67d146a850e0},14
            var key = new PROPERTYKEY();
            key.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0");
            key.pid = 14;
            var p = (IPropertyStore)Marshal.GetObjectForIUnknown(store);
            PROPVARIANT v;
            if (p.GetPropertyValue(ref key, out v) != 0) return "";
            return v.Value() ?? "";
        }
        catch { return ""; }
        finally { Marshal.Release(store); }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROPERTYKEY { public Guid fmtid; public int pid; }

    [StructLayout(LayoutKind.Explicit)]
    struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointerValue;
        public string Value()
        {
            if (vt == 31 && pointerValue != IntPtr.Zero) return Marshal.PtrToStringUni(pointerValue);
            return null;
        }
    }

    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        int GetCount(out int count);
        int GetAt(int i, out PROPERTYKEY key);
        int GetPropertyValue(ref PROPERTYKEY key, out PROPVARIANT value);
    }

    static IAudioEndpointVolume EndpointVolume(IMMDevice dev)
    {
        var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        object o;
        if (dev.Activate(ref iid, 1, IntPtr.Zero, out o) != 0) return null;
        return (IAudioEndpointVolume)o;
    }

    static IAudioSessionManager2 SessionManager(IMMDevice dev)
    {
        var iid = IID_IAudioSessionManager2;
        object o;
        if (dev.Activate(ref iid, 1, IntPtr.Zero, out o) != 0) return null;
        return (IAudioSessionManager2)o;
    }

    static string DefaultId(int flow)
    {
        IMMDevice dev;
        if (Enumerator().GetDefaultAudioEndpoint(flow, 1, out dev) != 0) return null;
        string id;
        dev.GetId(out id);
        return id;
    }

    /* ---------------------------------------------------------- API */

    /// Master volume of the default device, 0..100, or -1 on failure.
    public static int GetMasterVolume()
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0) return -1;
            var v = EndpointVolume(dev);
            if (v == null) return -1;
            float level;
            if (v.GetMasterVolumeLevelScalar(out level) != 0) return -1;
            return (int)Math.Round(level * 100f);
        }
        catch { return -1; }
    }

    /// Returns the volume actually set, 0..100, or -1 on failure.
    public static int SetMasterVolume(int percent)
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0) return -1;
            var v = EndpointVolume(dev);
            if (v == null) return -1;
            var ctx = Guid.Empty;
            float target = Math.Max(0f, Math.Min(100f, percent)) / 100f;
            if (v.SetMasterVolumeLevelScalar(target, ref ctx) != 0) return -1;
            return (int)Math.Round(target * 100f);
        }
        catch { return -1; }
    }

    /// 1 muted, 0 unmuted, -1 failure.
    public static int GetMasterMute()
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0) return -1;
            var v = EndpointVolume(dev);
            if (v == null) return -1;
            bool muted;
            if (v.GetMute(out muted) != 0) return -1;
            return muted ? 1 : 0;
        }
        catch { return -1; }
    }

    /// Returns the resulting mute state, or -1 on failure.
    public static int SetMasterMute(bool muted)
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0) return -1;
            var v = EndpointVolume(dev);
            if (v == null) return -1;
            var ctx = Guid.Empty;
            if (v.SetMute(muted, ref ctx) != 0) return -1;
            return muted ? 1 : 0;
        }
        catch { return -1; }
    }

    /// Microphone level of the default capture device, 0..100, or -1.
    public static int GetMicVolume()
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eCapture, 1, out dev) != 0) return -1;
            var v = EndpointVolume(dev);
            if (v == null) return -1;
            float level;
            if (v.GetMasterVolumeLevelScalar(out level) != 0) return -1;
            return (int)Math.Round(level * 100f);
        }
        catch { return -1; }
    }

    public static int GetMicMute()
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eCapture, 1, out dev) != 0) return -1;
            var v = EndpointVolume(dev);
            if (v == null) return -1;
            bool muted;
            if (v.GetMute(out muted) != 0) return -1;
            return muted ? 1 : 0;
        }
        catch { return -1; }
    }

    /// muted: 0 unmute, 1 mute, -1 leave alone. level: -1 leaves it alone.
    public static string SetMic(int muted, int level)
    {
        var errors = new List<string>();
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eCapture, 1, out dev) != 0)
                return "no capture device";
            var v = EndpointVolume(dev);
            if (v == null) return "the capture device has no volume control";
            var ctx = Guid.Empty;
            if (level >= 0)
            {
                float target = Math.Min(100f, level) / 100f;
                if (v.SetMasterVolumeLevelScalar(target, ref ctx) != 0) errors.Add("level");
            }
            if (muted >= 0)
            {
                if (v.SetMute(muted == 1, ref ctx) != 0) errors.Add("mute");
            }
        }
        catch (Exception e) { errors.Add(e.Message); }
        return errors.Count == 0 ? "" : string.Join("; ", errors.ToArray());
    }

    /// "id\tname\tkind\tactive" per line, for the default render and capture set.
    public static string ListDevices()
    {
        var lines = new List<string>();
        try
        {
            var en = Enumerator();
            string defRender = DefaultId(eRender);
            string defCapture = DefaultId(eCapture);
            foreach (int flow in new[] { eRender, eCapture })
            {
                IMMDeviceCollection coll;
                if (en.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, out coll) != 0) continue;
                int count;
                coll.GetCount(out count);
                for (int i = 0; i < count; i++)
                {
                    IMMDevice dev;
                    if (coll.Item(i, out dev) != 0) continue;
                    string id;
                    dev.GetId(out id);
                    bool active = (flow == eRender && id == defRender) || (flow == eCapture && id == defCapture);
                    lines.Add(id + "\t" + DeviceName(dev) + "\t" + (flow == eRender ? "output" : "input") + "\t" + (active ? "1" : "0"));
                }
            }
        }
        catch (Exception e) { lines.Add("error\t" + e.Message + "\toutput\t0"); }
        return string.Join("\n", lines.ToArray());
    }

    /// Set a device as default for console, multimedia and communications roles.
    public static string SetDefaultDevice(string id)
    {
        try
        {
            var type = Type.GetTypeFromCLSID(CLSID_PolicyConfig);
            var cfg = (IPolicyConfig)Activator.CreateInstance(type);
            // 0 = console, 1 = multimedia, 2 = communications
            for (int role = 0; role < 3; role++)
            {
                int hr = cfg.SetDefaultEndpoint(id, role);
                if (hr != 0) return "Windows refused the switch (0x" + hr.ToString("X8") + ").";
            }
            return "";
        }
        catch (Exception e) { return e.Message; }
    }

    /// Volume of one process's audio session, 0..100, or -1 if it has none.
    public static int GetProcessVolume(int pid)
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0) return -1;
            var mgr = SessionManager(dev);
            if (mgr == null) return -1;
            IAudioSessionEnumerator sessions;
            if (mgr.GetSessionEnumerator(out sessions) != 0) return -1;
            int count;
            sessions.GetCount(out count);
            for (int i = 0; i < count; i++)
            {
                IAudioSessionControl2 s;
                if (sessions.GetSession(i, out s) != 0) continue;
                uint spid;
                if (s.GetProcessId(out spid) != 0) continue;
                if ((int)spid == pid)
                {
                    var simple = (ISimpleAudioVolume)s;
                    float level;
                    if (simple.GetMasterVolume(out level) != 0) return -1;
                    return (int)Math.Round(level * 100f);
                }
            }
        }
        catch { }
        return -1;
    }

    /// Returns "" on success or a sentence explaining why it could not.
    public static string SetProcessVolume(int pid, int percent)
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0)
                return "There is no active output device.";
            var mgr = SessionManager(dev);
            if (mgr == null) return "Windows would not open the audio session manager.";
            IAudioSessionEnumerator sessions;
            if (mgr.GetSessionEnumerator(out sessions) != 0)
                return "Windows would not list audio sessions.";
            int count;
            sessions.GetCount(out count);
            bool found = false;
            for (int i = 0; i < count; i++)
            {
                IAudioSessionControl2 s;
                if (sessions.GetSession(i, out s) != 0) continue;
                uint spid;
                if (s.GetProcessId(out spid) != 0) continue;
                if ((int)spid != pid) continue;
                found = true;
                var simple = (ISimpleAudioVolume)s;
                var ctx = Guid.Empty;
                float target = Math.Max(0f, Math.Min(100f, percent)) / 100f;
                if (simple.SetMasterVolume(target, ref ctx) != 0)
                    return "Windows refused to change that program's volume.";
            }
            if (!found)
                // The common real cause: the program has not played any sound
                // yet, so Windows has not created a session for it. Saying
                // "failed" here would send the user looking for a bug.
                return "That program has no audio session yet. Windows creates one the first time it plays a sound.";
        }
        catch (Exception e) { return e.Message; }
        return "";
    }

    public static string SetProcessMute(int pid, bool muted)
    {
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0)
                return "There is no active output device.";
            var mgr = SessionManager(dev);
            if (mgr == null) return "Windows would not open the audio session manager.";
            IAudioSessionEnumerator sessions;
            if (mgr.GetSessionEnumerator(out sessions) != 0) return "Windows would not list audio sessions.";
            int count;
            sessions.GetCount(out count);
            bool found = false;
            for (int i = 0; i < count; i++)
            {
                IAudioSessionControl2 s;
                if (sessions.GetSession(i, out s) != 0) continue;
                uint spid;
                if (s.GetProcessId(out spid) != 0) continue;
                if ((int)spid != pid) continue;
                found = true;
                var simple = (ISimpleAudioVolume)s;
                var ctx = Guid.Empty;
                if (simple.SetMute(muted, ref ctx) != 0) return "Windows refused to change that program's mute.";
            }
            if (!found) return "That program has no audio session yet. Windows creates one the first time it plays a sound.";
        }
        catch (Exception e) { return e.Message; }
        return "";
    }

    /// Process ids that currently hold an audio session, for the per-app list.
    public static string SessionPids()
    {
        var ids = new List<string>();
        try
        {
            IMMDevice dev;
            if (Enumerator().GetDefaultAudioEndpoint(eRender, 1, out dev) != 0) return "";
            var mgr = SessionManager(dev);
            if (mgr == null) return "";
            IAudioSessionEnumerator sessions;
            if (mgr.GetSessionEnumerator(out sessions) != 0) return "";
            int count;
            sessions.GetCount(out count);
            for (int i = 0; i < count; i++)
            {
                IAudioSessionControl2 s;
                if (sessions.GetSession(i, out s) != 0) continue;
                uint pid;
                if (s.GetProcessId(out pid) == 0 && pid != 0) ids.Add(pid.ToString());
            }
        }
        catch { }
        return string.Join(",", ids.ToArray());
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        int SetMasterVolume(float level, ref Guid ctx);
        int GetMasterVolume(out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }
}
