"""Regression fixtures for content accidentally appended after </html>."""
from pathlib import Path
import importlib.util
import tempfile
import unittest


CHECKER_PATH = Path(__file__).with_name('check-website.py')
SPEC = importlib.util.spec_from_file_location('website_checker', CHECKER_PATH)
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)

PAGE = '''<!doctype html><html lang="en"><head>
<title>Website boundary fixture</title>
<meta name="description" content="A complete page used to check document boundaries.">
<meta property="og:description" content="A complete page used to check document boundaries.">
<meta property="og:url" content="https://totemservices.org/">
<link rel="canonical" href="https://totemservices.org/">
</head><body><h1>Website boundary fixture</h1></body></html>'''
BOUNDARY_ERROR = 'Page content must appear before the closing HTML document'
RUNTIME_FILES = (
    'assets/site.js', 'assets/style.css', 'api/contact.php',
    'api/enquiry-validation.php', 'api/enquiry-rate-limit.php',
)


class DocumentBoundaryTests(unittest.TestCase):
    def check_fixture(self, trailing):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_text(PAGE + trailing, encoding='utf-8')
            (root / 'sitemap.xml').write_text(
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                '<url><loc>https://totemservices.org/</loc></url></urlset>',
                encoding='utf-8',
            )
            for name in RUNTIME_FILES:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('', encoding='utf-8')
            _, failures = CHECKER.check_site(root, {'index.html', 'sitemap.xml', *RUNTIME_FILES})
            return failures

    def test_trailing_whitespace_and_comments_are_allowed(self):
        for trailing in ('', '\n \t\r\n', '\n<!-- Deployment note -->\n',
                         '<!-- <div>Not rendered content</div> -->\n'):
            with self.subTest(trailing=trailing):
                self.assertEqual(self.check_fixture(trailing), [])

    def test_appended_elements_are_rejected(self):
        for trailing in ('\n<div class="wrap"><h2>Client evidence</h2></div>',
                         '\n<img src="https://example.com/evidence.png" />'):
            with self.subTest(trailing=trailing):
                self.assertIn(('index.html', BOUNDARY_ERROR), self.check_fixture(trailing))

    def test_appended_text_and_entities_are_rejected(self):
        for trailing in ('\n>', '\nUnclosed evidence block', '\n&gt;', '\n&#62;'):
            with self.subTest(trailing=trailing):
                self.assertIn(('index.html', BOUNDARY_ERROR), self.check_fixture(trailing))


if __name__ == '__main__':
    unittest.main()
