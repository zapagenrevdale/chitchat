from pathlib import Path
import hashlib
import json

audit = Path('.audit')

def task(snapshot, task_id):
    data = json.loads((audit / f'repository-improvement-tooling.{snapshot}.json').read_text())
    return next(item for item in data['tasks'] if item['taskId'] == task_id)

before = task('before-test', '@chitchat/backend#test')
after = task('after-test', '@chitchat/backend#test')
assets = sorted(Path('apps/web/public/images/personas').glob('*.svg'))
assert assets, 'No persona SVGs found'
for asset in assets:
    key = '../web/public/images/personas/' + asset.name
    content = asset.read_bytes()
    expected = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
    assert key not in before['inputs'], f'{key} already present in baseline'
    assert after['inputs'][key] == expected, f'{key} missing or incorrect content hash'
assert 'src/practice/gemini.test.ts' in after['inputs'], 'Default package inputs lost'
assert before['dependencies'] == after['dependencies'], 'Backend dependency changed'
assert after['resolvedTaskDefinition']['dependsOn'] == ['^build']
db = task('after-build', '@chitchat/db#build')
assert db['resolvedTaskDefinition']['dependsOn'] == ['^build']
assert db['outputs'] == ['src/generated/**'], 'Unexpected package-local override'
receipt = {
    'result': 'PASS',
    'personaSvgContentHashesVerified': len(assets),
    'defaultBackendInputsRetained': True,
    'backendDependenciesRetained': after['dependencies'],
    'effectiveDbOutputs': db['outputs'],
    'dbOutputCaveat': 'Existing packages/db/turbo.json overrides the root DB output declaration. Baseline already includes generated outputs.',
}
(audit / 'repository-improvement-tooling.inputs-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
