"""Ensure the shared NU40 module works with the existing direct-script launcher."""
from pathlib import Path
import subprocess
import sys
import unittest


class SharedTransportTests(unittest.TestCase):
    def test_legacy_and_shared_imports_use_same_classes(self):
        import nu40_imu as legacy
        from multidevice_app import nu40_transport as shared
        for name in legacy.__all__:
            self.assertIs(getattr(legacy, name), getattr(shared, name))

    def test_import_from_unrelated_working_directory(self):
        app_dir = Path(__file__).resolve().parent
        result = subprocess.run(
            [sys.executable, '-c',
             'import sys; sys.path.insert(0, sys.argv[1]); '
             'import stream_server; '
             'from multidevice_app.nu40_transport import ImuHub; '
             'assert stream_server.ImuHub is ImuHub; '
             'assert stream_server.IMU is None', str(app_dir)],
            cwd=Path(sys.executable).resolve().parent,
            capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
