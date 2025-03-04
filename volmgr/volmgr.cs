using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace VolumeController;

[JsonSourceGenerationOptions(WriteIndented = true)]
[JsonSerializable(typeof(Command))]
[JsonSerializable(typeof(Response))]
internal partial class SourceGenContext : JsonSerializerContext {}

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumerator;

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
	int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
	int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceCollection {
	int GetCount(out int count);
	int Item(int index, out IMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
	int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume {
	int RegisterControlChangeNotify(IntPtr notify);
	int UnregisterControlChangeNotify(IntPtr notify);
	int GetChannelCount(out int count);
	int SetMasterVolumeLevel(float level, ref Guid context);
	int SetMasterVolumeLevelScalar(float level, ref Guid context);
	int GetMasterVolumeLevel(out float level);
	int GetMasterVolumeLevelScalar(out float level);
	int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
	int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
	int GetChannelVolumeLevel(uint channel, out float level);
	int GetChannelVolumeLevelScalar(uint channel, out float level);
	int SetMute(bool mute, ref Guid context);
	int GetMute(out bool mute);
}

internal static class Program {
	private static Guid empty_guid = Guid.Empty;

	private static void with_audio_interface(Action<IAudioEndpointVolume> action) {
		var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
		try {
			enumerator.GetDefaultAudioEndpoint(0, 1, out var device);
			try {
				var iid = typeof(IAudioEndpointVolume).GUID;
				device.Activate(ref iid, 1, IntPtr.Zero, out var volume);
				try {
					var volume_interface = (IAudioEndpointVolume)volume;
					action(volume_interface);
				} finally {
					if (volume != null)
						Marshal.ReleaseComObject(volume);
				}
			} finally {
				if (device != null)
					Marshal.ReleaseComObject(device);
			}
		} finally {
			Marshal.ReleaseComObject(enumerator);
		}
	}

	private static T with_audio_interface<T>(Func<IAudioEndpointVolume, T> func) {
		var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
		try {
			enumerator.GetDefaultAudioEndpoint(0, 1, out var device);
			try {
				var iid = typeof(IAudioEndpointVolume).GUID;
				device.Activate(ref iid, 1, IntPtr.Zero, out var volume);
				try {
					var volume_interface = (IAudioEndpointVolume)volume;
					return func(volume_interface);
				} finally {
					if (volume != null)
						Marshal.ReleaseComObject(volume);
				}
			} finally {
				if (device != null)
					Marshal.ReleaseComObject(device);
			}
		} finally {
			Marshal.ReleaseComObject(enumerator);
		}
	}

	private static float get_volume() {
		return with_audio_interface(volume_interface => {
			volume_interface.GetMasterVolumeLevelScalar(out var level);
			return level;
		});
	}

	private static void set_volume(float level) {
		with_audio_interface(volume_interface => {
			volume_interface.SetMasterVolumeLevelScalar(level, ref empty_guid);
		});
	}

	private static void Main() {
		while (true) {
			var input = Console.ReadLine();
			if (string.IsNullOrEmpty(input)) 
				continue;

			try {
				var command = JsonSerializer.Deserialize(input, SourceGenContext.Default.Command);
				var response = new Response();

				switch (command?.cmd.ToLower()) {
					case "get":
						response = new Response { value = get_volume() };
						break;

					case "set":
						if (command.value.HasValue)
							set_volume(Math.Clamp(command.value.Value, 0, 1));
						response = new Response { value = get_volume() };
						break;

					default:
						response = new Response { error = "Invalid command" };
						break;
				}

				Console.WriteLine(JsonSerializer.Serialize(response, SourceGenContext.Default.Response));
			} catch (Exception ex) {
				Console.WriteLine(JsonSerializer.Serialize(
					new Response { error = ex.Message }, 
					SourceGenContext.Default.Response
				));
			}
		}
	}
}

internal record Command {
	public string cmd { get; init; } = "";
	public float? value { get; init; }
}

internal record Response {
	public float? value { get; init; }
	public string? error { get; init; }
}