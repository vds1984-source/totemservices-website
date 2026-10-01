"""Check the static website using Python's standard library.

Run from a checkout with: python3 scripts/check-website.py
Git's tracked-file inventory supports a checkout that omits large MP4 files.
--manifest is only for source audits whose media bytes were not downloaded.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import json
import posixpath
import re
import subprocess
import xml.etree.ElementTree as ET


ORIGIN = 'https://totemservices.org/'
DEVELOPMENT = {'.git', '.github', 'scripts', 'tests', 'docs', 'node_modules'}
FORM_TYPES = {
    'contact/index.html': 'contact',
    'book-consultation/index.html': 'consultation',
    'request-proposal/index.html': 'proposal',
}


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.head_tags = []
        self.in_head = False
        self.titles = []
        self.title = None
        self.structured_data = []
        self.schema = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head': self.in_head = True
        self.tags.append((tag, attrs))
        if self.in_head: self.head_tags.append((tag, attrs))
        if tag == 'title' and self.in_head: self.title = []
        if tag == 'script' and attrs.get('type', '').lower() == 'application/ld+json': self.schema = []

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_data(self, data):
        if self.title is not None: self.title.append(data)
        if self.schema is not None: self.schema.append(data)

    def handle_endtag(self, tag):
        if tag == 'head': self.in_head = False
        if tag == 'title' and self.title is not None:
            self.titles.append(''.join(self.title).strip())
            self.title = None
        if tag == 'script' and self.schema is not None:
            self.structured_data.append(''.join(self.schema))
            self.schema = None


def inventory(root, manifest):
    project = subprocess.run(['git', '-C', str(root), 'rev-parse', '--show-toplevel'], capture_output=True, text=True)
    if project.returncode == 0 and Path(project.stdout.strip()).resolve() == root:
        tracked = subprocess.run(['git', '-C', str(root), 'ls-files', '-z'], check=True, capture_output=True)
        paths = set(filter(None, tracked.stdout.decode('utf-8').split('\0')))
    else:
        paths = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts}
    if manifest:
        data = json.loads(manifest.read_text(encoding='utf-8'))
        if data.get('truncated'): raise ValueError('The supplied source manifest is incomplete')
        paths.update(item['path'] for item in data['tree'] if item['type'] == 'blob')
    return paths


def local_target(value, source):
    parsed = urlsplit(value)
    if parsed.netloc:
        if parsed.scheme not in ('', 'http', 'https') or parsed.hostname not in ('totemservices.org', 'www.totemservices.org'):
            return None
    elif parsed.scheme:
        return None
    if not parsed.path: return None
    target = unquote(parsed.path)
    target = target.lstrip('/') if target.startswith('/') else posixpath.join(posixpath.dirname(source), target)
    if parsed.path.endswith('/'): target += 'index.html'
    return posixpath.normpath(target)


def check_site(root, paths):
    failures = []
    descriptions = []
    pages = sorted(path for path in paths if path.endswith('.html') and not set(Path(path).parts).intersection(DEVELOPMENT))
    if not pages: failures.append(('site', 'No public HTML pages were found'))
    for name in pages:
        file = root / name
        if not file.is_file():
            failures.append((name, 'Tracked HTML page is missing from the checkout'))
            continue
        text = file.read_text(encoding='utf-8')
        page = Page(text)
        expected = ORIGIN + name.removesuffix('index.html')
        canonical = [a.get('href') for t, a in page.head_tags if t == 'link' and 'canonical' in a.get('rel', '').lower().split()]
        og_url = [a.get('content') for t, a in page.head_tags if t == 'meta' and a.get('property') == 'og:url']
        meta = [a.get('content', '').strip() for t, a in page.head_tags if t == 'meta' and a.get('name') == 'description']
        og_description = [a.get('content', '').strip() for t, a in page.head_tags if t == 'meta' and a.get('property') == 'og:description']
        if canonical != [expected]: failures.append((name, 'Expected one self-referencing canonical URL'))
        if og_url != [expected]: failures.append((name, 'Expected one matching Open Graph URL'))
        if len(page.titles) != 1 or not page.titles[0]: failures.append((name, 'Expected one nonempty page title'))
        if len(meta) != 1 or not meta[0]: failures.append((name, 'Expected one nonempty meta description'))
        else:
            descriptions.append(meta[0])
            if 'Totem helps ambitious businesses grow through strategy' in meta[0]: failures.append((name, 'Replace the generic description with a page-specific description'))
        if len(og_description) != 1 or not og_description[0]: failures.append((name, 'Expected one nonempty Open Graph description'))
        if sum(tag == 'h1' for tag, _ in page.tags) != 1: failures.append((name, 'Expected one H1 heading'))
        if len(re.findall(r'<script\b', text, re.I)) != len(re.findall(r'</script\s*>', text, re.I)):
            failures.append((name, 'Script opening and closing tags do not match'))
        for data in page.structured_data:
            try: json.loads(data)
            except ValueError: failures.append((name, 'Invalid JSON-LD structured data'))

        ids = {a['id'] for _, a in page.tags if a.get('id')}
        labels = {a['for'] for t, a in page.tags if t == 'label' and a.get('for')}
        lead_forms = [a for t, a in page.tags if t == 'form' and 'leadform' in a.get('class', '').split()]
        if name in FORM_TYPES:
            if len(lead_forms) != 1: failures.append((name, 'Expected exactly one enquiry form'))
            types = [a.get('value') for t, a in page.tags if t == 'input' and a.get('name') == 'FormType']
            if types != [FORM_TYPES[name]]: failures.append((name, 'Enquiry form type does not match the page'))
        for form in lead_forms:
            if form.get('method', '').lower() != 'post' or form.get('action') != '/api/contact.php':
                failures.append((name, 'Enquiry form must POST to /api/contact.php'))
        for tag, attrs in page.tags:
            if tag in ('input', 'select', 'textarea') and attrs.get('type', '').lower() != 'hidden' and attrs.get('name') != 'website':
                referenced = attrs.get('aria-labelledby', '').split()
                named = bool(attrs.get('aria-label', '').strip()) or (bool(referenced) and all(item in ids for item in referenced)) or attrs.get('id') in labels
                if not named: failures.append((name, 'Form field needs a label: ' + repr(attrs.get('name'))))
            for attr in ('href', 'src', 'poster', 'action'):
                if attr not in attrs: continue
                try: target = local_target(attrs[attr], name)
                except ValueError:
                    failures.append((name, 'Invalid URL: ' + repr(attrs[attr])))
                    continue
                if target is not None and target not in paths:
                    failures.append((name, 'Missing local target: ' + repr(attrs[attr])))

    for description, count in Counter(descriptions).items():
        if count > 1: failures.append(('site', 'Duplicate meta description: ' + repr(description)))
    for name in sorted(path for path in paths if path.endswith('.css') and not set(Path(path).parts).intersection(DEVELOPMENT)):
        file = root / name
        if not file.is_file():
            failures.append((name, 'Tracked stylesheet is missing from the checkout'))
            continue
        stylesheet = re.sub(r'/\*.*?\*/', '', file.read_text(encoding='utf-8'), flags=re.S)
        for match in re.finditer(r'url\(\s*(["\']?)(.*?)\1\s*\)', stylesheet, re.I):
            try: target = local_target(match.group(2), name)
            except ValueError:
                failures.append((name, 'Invalid stylesheet URL'))
                continue
            if target is not None and target not in paths: failures.append((name, 'Missing stylesheet asset: ' + repr(match.group(2))))

    expected_urls = {ORIGIN + name.removesuffix('index.html') for name in pages}
    try:
        sitemap = ET.parse(root / 'sitemap.xml')
        urls = [node.text.strip() if node.text else '' for node in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
        if len(urls) != len(set(urls)): failures.append(('sitemap.xml', 'Duplicate page URLs'))
        if set(urls) != expected_urls: failures.append(('sitemap.xml', 'Sitemap URLs must match the public HTML pages'))
    except (OSError, ET.ParseError): failures.append(('sitemap.xml', 'Missing or invalid sitemap XML'))
    for required in ('assets/site.js', 'assets/style.css', 'api/contact.php', 'api/enquiry-validation.php', 'api/enquiry-rate-limit.php'):
        if required not in paths: failures.append(('site', 'Required runtime file is missing: ' + required))
    return pages, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--manifest', type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir(): parser.error('Website root must be an existing directory')
    try: pages, failures = check_site(root, inventory(root, args.manifest))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print('ERROR: ' + str(error))
        return 1
    for name, message in failures: print('ERROR ' + name + ': ' + message)
    if failures:
        print(f'FAILED: {len(failures)} problem(s) found. Fix them before merging.')
        return 1
    print(f'PASS: {len(pages)} pages; metadata, headings, JSON-LD, enquiry forms, sitemap and local asset paths.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
