"""Exercise the private entry page with real loopback Apache/PHP and dummy users.

Requires apache2, PHP CLI and libapache2-mod-php. No remote service is contacted.
HTTPS metadata is simulated; certificate/TLS and actual hPanel deployment remain
separate acceptance checks. Run from a repository root.
"""
import base64
import contextlib
import os
from pathlib import Path
import pwd
import grp
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'totem-crm-test'
AUTH_USER = 'fixture-tester'
AUTH_PASSWORD = 'synthetic-loopback-only-password'


@contextlib.contextmanager
def server(overrides=True, https=True):
    apache = shutil.which('apache2')
    php = shutil.which('php8.3') or shutil.which('php')
    modules = Path('/usr/lib/apache2/modules')
    php_modules = sorted(modules.glob('libphp*.so'))
    if not apache or not php or not php_modules:
        raise RuntimeError('Install Apache, PHP CLI and libapache2-mod-php before running this check')
    with tempfile.TemporaryDirectory(prefix='totem-private-page-') as directory:
        temporary = Path(directory)
        temporary.chmod(0o755)
        public = temporary / 'public_html'
        public.mkdir()
        (public / 'index.html').write_text('Public Totem website fixture')
        protected = public / 'totem-crm-test'
        shutil.copytree(PAGE, protected)
        private = temporary / 'private'
        private.mkdir()
        digest = subprocess.run(
            [php, '-r', 'echo password_hash(trim(stream_get_contents(STDIN)), PASSWORD_BCRYPT, ["cost" => 4]);'],
            input=AUTH_PASSWORD, text=True, capture_output=True, check=True,
        ).stdout
        password_file = temporary / 'fixture.htpasswd'
        password_file.write_text(f'{AUTH_USER}:{digest}\n')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        uid = 33 if os.geteuid() == 0 else os.geteuid()
        account = pwd.getpwuid(uid)
        group = grp.getgrgid(account.pw_gid).gr_name
        required = ['mpm_prefork', 'authn_core', 'authn_file', 'authz_core', 'authz_host',
                    'authz_user', 'auth_basic', 'dir', 'mime', 'headers', 'env']
        loads = [f'LoadModule {name}_module "{modules / ("mod_" + name + ".so")}"' for name in required]
        if (modules / 'mod_unixd.so').exists():
            loads.append(f'LoadModule unixd_module "{modules / "mod_unixd.so"}"')
        loads.append(f'LoadModule php_module "{php_modules[-1]}"')
        configuration = temporary / 'apache.conf'
        configuration.write_text('\n'.join([
            f'ServerRoot "{temporary}"', f'Listen 127.0.0.1:{port}', 'ServerName localhost',
            f'PidFile "{temporary / "apache.pid"}"', f'ErrorLog "{temporary / "error.log"}"',
            'LogLevel warn', 'ServerTokens Prod', 'ServerSignature Off', *loads,
            f'User {account.pw_name}', f'Group {group}', f'DocumentRoot "{public}"',
            'TypesConfig /etc/mime.types', 'DirectoryIndex index.php index.html',
            '<Directory />', 'Require all denied', '</Directory>',
            f'<Directory "{public}">', f'AllowOverride {"All" if overrides else "None"}',
            'Require all granted', '</Directory>', '<FilesMatch "\\.php$">',
            'SetHandler application/x-httpd-php', '</FilesMatch>',
            f'SetEnv HTTPS {"on" if https else "off"}',
            'php_admin_flag display_errors Off', 'php_admin_flag opcache.enable Off',
        ]) + '\n')
        subprocess.run([apache, '-t', '-f', str(configuration)], check=True, capture_output=True)
        # Apache can signal its process group during shutdown. Keep that group
        # separate from Python/the CI runner before terminating the fixture.
        process = subprocess.Popen([apache, '-f', str(configuration), '-DFOREGROUND'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                   start_new_session=True)

        class Fixture:
            def activate(self):
                text = (PAGE / '.htaccess').read_text()
                text = text.replace('Require all denied', '\n'.join([
                    'AuthType Basic', 'AuthName "Totem private fixture"', 'AuthBasicProvider file',
                    f'AuthUserFile "{password_file}"', 'Require valid-user',
                ]), 1)
                (protected / '.htaccess').write_text(text)

            def config(self, contents):
                (private / 'totem-crm-test.php').write_text(contents)

            def request(self, path='/totem-crm-test/', credentials=None, headers=None):
                request_headers = dict(headers or {})
                if credentials is not None:
                    encoded = base64.b64encode(credentials.encode()).decode()
                    request_headers['Authorization'] = f'Basic {encoded}'
                request = urllib.request.Request(f'http://127.0.0.1:{port}{path}', headers=request_headers)
                try:
                    response = urllib.request.urlopen(request, timeout=5)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    return response.status, response.headers, response.read().decode()

        fixture = Fixture()
        try:
            for attempt in range(60):
                if process.poll() is not None:
                    raise RuntimeError((temporary / 'error.log').read_text() if (temporary / 'error.log').exists() else 'Apache stopped')
                try:
                    fixture.request('/')
                    break
                except (urllib.error.URLError, ConnectionError):
                    if attempt == 59:
                        raise
                    time.sleep(0.05)
            yield fixture, private, public
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            if process.stderr:
                process.stderr.close()


class PrivateEntryChecks(unittest.TestCase):
    def test_closed_by_default_without_locking_public_homepage(self):
        with server() as (fixture, _, _):
            for path in ['/totem-crm-test/', '/totem-crm-test/index.php']:
                status, _, body = fixture.request(path)
                self.assertEqual(status, 403)
                self.assertNotIn('Totem CRM test area', body)
            self.assertEqual(fixture.request('/')[0], 200)

    def test_directory_auth_rejects_missing_wrong_and_forged_credentials(self):
        with server() as (fixture, _, _):
            fixture.activate()
            for credentials, headers in [(None, {}), (f'{AUTH_USER}:wrong-password', {}),
                (None, {'X-Remote-User': AUTH_USER, 'Remote-User': AUTH_USER, 'X-Forwarded-User': AUTH_USER})]:
                for path in ['/totem-crm-test/', '/totem-crm-test/index.php', '/totem-crm-test/missing-file.txt']:
                    status, response_headers, body = fixture.request(path, credentials, headers)
                    self.assertEqual(status, 401)
                    self.assertIn('Basic', response_headers.get('WWW-Authenticate', ''))
                    self.assertNotIn('Totem CRM test area', body)

    def test_correct_login_gets_headers_and_disabled_launcher(self):
        with server() as (fixture, _, _):
            fixture.activate()
            status, headers, body = fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}')
            self.assertEqual(status, 200)
            self.assertIn('Totem CRM test area', body)
            self.assertIn('Clone not connected yet', body)
            self.assertIn('disabled>Open test CRM', body)
            self.assertNotIn('href="https://tmac.totemservices.org/', body)
            self.assertIn('no-store', headers.get('Cache-Control', ''))
            self.assertIn('noindex', headers.get('X-Robots-Tag', ''))
            self.assertEqual(headers.get('Referrer-Policy'), 'no-referrer')
            self.assertIn("frame-ancestors 'none'", headers.get('Content-Security-Policy', ''))
            self.assertNotIn(AUTH_PASSWORD, body)

    def test_php_stays_closed_if_directory_overrides_are_ignored(self):
        with server(overrides=False) as (fixture, _, _):
            status, _, body = fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}',
                headers={'X-Remote-User': AUTH_USER, 'X-Forwarded-User': AUTH_USER})
            self.assertEqual(status, 403)
            self.assertEqual(body, 'Access denied.')

    def test_authenticated_http_is_rejected_even_with_forwarded_https_header(self):
        with server(https=False) as (fixture, _, _):
            fixture.activate()
            status, _, body = fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}',
                                               headers={'X-Forwarded-Proto': 'https'})
            self.assertEqual(status, 403)
            self.assertEqual(body, 'HTTPS is required.')

    def test_verified_private_clone_configuration_enables_only_clone(self):
        with server() as (fixture, _, _):
            fixture.activate()
            fixture.config("<?php return ['clone_url'=>'https://tmac.totemservices.org/', 'access_verified'=>true];")
            status, _, body = fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}')
            self.assertEqual(status, 200)
            self.assertIn('href="https://tmac.totemservices.org/"', body)
            self.assertIn('Clone configured', body)
            self.assertNotIn('disabled>Open test CRM', body)

    def test_unverified_clone_keeps_launcher_disabled(self):
        with server() as (fixture, _, _):
            fixture.activate()
            fixture.config("<?php return ['clone_url'=>'https://tmac.totemservices.org/', 'access_verified'=>false];")
            self.assertIn('disabled>Open test CRM', fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}')[2])

    def test_configuration_rejects_live_and_untrusted_destinations(self):
        destinations = ['https://crm.totemservices.org/', 'https://totemservices.org/',
                        'https://example.invalid/', 'http://tmac.totemservices.org/',
                        'https://tmac.totemservices.org:8443/', 'https://user:password@tmac.totemservices.org/',
                        'https://tmac.totemservices.org/?redirect=production',
                        'https://tmac.totemservices.org/#production', 'https://tmac.totemservices.org/other-path']
        with server() as (fixture, _, _):
            fixture.activate()
            for destination in destinations:
                with self.subTest(destination=destination):
                    fixture.config(f"<?php return ['clone_url'=>'{destination}', 'access_verified'=>true];")
                    status, _, body = fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}')
                    self.assertEqual(status, 200)
                    self.assertIn('disabled>Open test CRM', body)
            fixture.config("<?php return 'invalid configuration type';")
            self.assertIn('disabled>Open test CRM', fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}')[2])

    def test_private_config_symlink_into_public_webroot_is_rejected(self):
        with server() as (fixture, private, public):
            fixture.activate()
            (public / 'fixture.php').write_text("<?php return ['clone_url'=>'https://tmac.totemservices.org/', 'access_verified'=>true];")
            (private / 'totem-crm-test.php').symlink_to(public / 'fixture.php')
            self.assertIn('disabled>Open test CRM', fixture.request(credentials=f'{AUTH_USER}:{AUTH_PASSWORD}')[2])


if __name__ == '__main__':
    unittest.main(verbosity=2)
