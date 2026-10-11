from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import uuid

root = Path.cwd()
audit = root / '.audit'
run_id = uuid.uuid4().hex
prefix = audit / f'repository-improvement-tooling.cache-{run_id}'
generated = root / 'packages/db/src/generated/prisma'
original = Path(f'{prefix}.original')
backup = Path(f'{prefix}.backup')
partial = Path(f'{prefix}.partial')

def run(args, suffix):
    result = subprocess.run(args, text=True, capture_output=True)
    Path(f'{prefix}.{suffix}.log').write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f'{args} failed with {result.returncode}')
    return result.stdout + result.stderr

def manifest(directory):
    return {
        str(path.relative_to(directory)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(directory.rglob('*')) if path.is_file()
    }

had_original = generated.exists()
if had_original:
    shutil.copytree(generated, original)

try:
    run(['bun', 'run', 'build', '--filter=@chitchat/db', '--force', '--ui=stream'], 'populate')
    assert (generated / 'client.ts').is_file(), 'Generated Prisma client missing'
    expected = manifest(generated)
    generated.rename(backup)
    output = run(['bun', 'run', 'build', '--filter=@chitchat/db', '--ui=stream'], 'restore')
    assert 'cache hit' in output, output
    assert (generated / 'client.ts').is_file(), 'Cache did not restore Prisma client'
    assert manifest(generated) == expected, 'Cache restoration differs from generated output'
    receipt = {
        'result': 'PASS',
        'backup': str(backup.relative_to(root)),
        'original': str(original.relative_to(root)) if had_original else None,
        'restoredFileCount': len(expected),
        'clientSha256': expected['client.ts'],
        'cacheHit': True,
    }
    if had_original and manifest(original) != expected:
        generated.rename(partial)
        shutil.copytree(original, generated)
        receipt['originalUserContentsRestored'] = True
    Path(f'{prefix}.receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))
except BaseException:
    if generated.exists():
        generated.rename(partial)
    if had_original:
        shutil.copytree(original, generated)
    elif backup.exists():
        shutil.copytree(backup, generated)
    raise
