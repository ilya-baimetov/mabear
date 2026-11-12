"""Restore only into a NEW directory: never overwrite an existing checkout."""
import pathlib,tarfile,sys,hashlib,json
here=pathlib.Path(__file__).resolve().parent
if len(sys.argv)!=2:raise SystemExit('Usage: python3 reproduce-baseline.py /new/empty/directory')
target=pathlib.Path(sys.argv[1]).resolve()
if target.exists() and any(target.iterdir()):raise SystemExit('Refusing non-empty destination')
target.mkdir(parents=True,exist_ok=True)
with tarfile.open(here/'baseline-source.tar.gz') as archive:archive.extractall(target,filter='data')
manifest=json.loads((here/'baseline-manifest.json').read_text())
for path,digest in manifest['files'].items():
 assert hashlib.sha256((target/path).read_bytes()).hexdigest()==digest,path
print(f"Verified {len(manifest['files'])} files in {target}. Run npm ci there to reproduce dependencies.")
