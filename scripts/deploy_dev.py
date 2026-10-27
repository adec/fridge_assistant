#!/usr/bin/env python3
"""Deploy a working copy to a paired HAOS dev instance; never publishes Git changes."""
import argparse
import datetime as dt
import io
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tarfile
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / '.dev-deploy.json'
CONTROL_PATH = None
MASTER_STARTED = False
REMOTE = r'''
import datetime,json,os,pathlib,shutil,subprocess,sys,tarfile,urllib.request,urllib.error
mode,root_text,identity=sys.argv[1:4]
root=pathlib.Path(root_text).resolve()
marker=root/'.fridge-assistant-dev'
if mode=='pair':
 if not root.is_dir() or not os.environ.get('SUPERVISOR_TOKEN') or not shutil.which('ha'):raise SystemExit('Requires HAOS SSH app with Supervisor access and ha CLI')
 if marker.exists() and marker.read_text().strip()!=identity:raise SystemExit('Dev marker already belongs to another deployment config')
 marker.write_text(identity+'\n');marker.chmod(0o600);print('Dev target paired');raise SystemExit
if not marker.exists() or marker.read_text().strip()!=identity:raise SystemExit('Dev marker missing or different; refusing deployment')
def api(path,method='GET'):
 req=urllib.request.Request('http://supervisor/core/api/'+path,method=method,headers={'Authorization':'Bearer '+os.environ['SUPERVISOR_TOKEN']})
 with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
if mode=='status':
 try:
  api('')
  entries=api('config/config_entries/entry')
  own=[e for e in entries if e.get('domain')=='fridge_assistant']
  if not own:print('API ready; configure Fridge Assistant on dev to validate integration startup');raise SystemExit(2)
  states=[e.get('state') for e in own]
  print('Fridge Assistant: '+', '.join(states))
  raise SystemExit(0 if all(s=='loaded' for s in states) else 3)
 except urllib.error.HTTPError as e:
  if e.code not in (401,403):print('Startup check: '+str(e));raise SystemExit(3)
  # The official SSH app has Supervisor access but no Core API permission.
  req=urllib.request.Request('http://supervisor/core/stats',headers={'Authorization':'Bearer '+os.environ['SUPERVISOR_TOKEN']})
  try:
   with urllib.request.urlopen(req,timeout=15) as response:
    if json.load(response).get('result')!='ok':raise ValueError('Core stats unavailable')
   config=root/'.storage/core.config_entries'
   entries=json.loads(config.read_text()).get('data',{}).get('entries',[]) if config.exists() else []
   own=[entry for entry in entries if entry.get('domain')=='fridge_assistant']
   if not own:print('Core running; add Fridge Assistant in Devices & services, then check again. Integration is not configured yet.');raise SystemExit(2)
   print('Core running; Fridge Assistant is configured. Runtime loaded state cannot be verified with this SSH app token; verify in Devices & services.');raise SystemExit(4)
  except Exception as fallback:print('Startup check: '+str(fallback));raise SystemExit(3)
 except Exception as e:print('Startup check: '+str(e));raise SystemExit(3)
if mode=='probe':
 if not os.environ.get('SUPERVISOR_TOKEN') or not shutil.which('ha'):raise SystemExit('Requires HAOS SSH app with Supervisor access, Python and ha CLI')
 print('Paired dev target ready');raise SystemExit
backup_root=root/'fridge-assistant-dev-backups';backup_root.mkdir(mode=0o700,exist_ok=True)
target=root/'custom_components/fridge_assistant'
target.parent.mkdir(parents=True,exist_ok=True)
if mode=='rollback':
 name=sys.argv[4]
 if pathlib.Path(name).name!=name:raise SystemExit('Use a backup name, not a path')
 backup=backup_root/name
 if not (backup/'code').is_dir():raise SystemExit('No integration code in that backup')
 stage=target.with_name('fridge_assistant.rollback');shutil.copytree(backup/'code',stage)
 old=target.with_name('fridge_assistant.rollback-old')
 if old.exists():raise SystemExit('Previous rollback needs recovery: '+str(old))
 if target.exists():target.rename(old)
 try:stage.rename(target)
 except BaseException:
  if old.exists():old.rename(target)
  raise
 if old.exists():shutil.rmtree(old)
 print('Code restored; inventory data left unchanged',flush=True)
else:
 import tempfile
 with tempfile.TemporaryDirectory(dir=target.parent) as folder:
  stage=pathlib.Path(folder)/'code';stage.mkdir()
  with tarfile.open(fileobj=sys.stdin.buffer,mode='r|') as archive:
   for member in archive:
    dest=(stage/member.name).resolve()
    if not dest.is_relative_to(stage.resolve()) or not member.isfile():raise SystemExit('Unexpected archive member')
    dest.parent.mkdir(parents=True,exist_ok=True)
    with archive.extractfile(member) as src,open(dest,'wb') as out:shutil.copyfileobj(src,out)
  if not (stage/'manifest.json').is_file():raise SystemExit('Manifest missing')
  subprocess.run([sys.executable,'-m','compileall','-q',str(stage)],check=True)
  stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
  backup=backup_root/stamp;backup.mkdir(mode=0o700)
  if target.exists():shutil.copytree(target,backup/'code')
  storage=root/'.storage'
  for p in storage.glob('fridge_assistant*'):
   if p.is_file():
    (backup/'storage').mkdir(exist_ok=True);shutil.copy2(p,backup/'storage'/p.name)
  old=target.with_name('fridge_assistant.deploy-old')
  if old.exists():raise SystemExit('Previous deployment needs recovery: '+str(old))
  if target.exists():target.rename(old)
  try:stage.rename(target)
  except BaseException:
   if old.exists():old.rename(target)
   raise
  if old.exists():shutil.rmtree(old)
  print('Backup: '+stamp,flush=True)
# HAOS CLI talks to Supervisor. No credentials leave this host.
subprocess.run(['ha','core','restart'],check=True)
print('Restart requested',flush=True)
'''


def configuration():
    if not CONFIG.exists():
        raise SystemExit('Create .dev-deploy.json from docs/dev-deploy.example.json first.')
    cfg = json.loads(CONFIG.read_text())
    for key in ('host', 'user', 'identity'):
        if not isinstance(cfg.get(key), str) or not cfg[key].strip():
            raise SystemExit('Missing configuration: '+key)
    if cfg['host'].lower() in {str(host).lower() for host in cfg.get('blocked_hosts', [])}:
        raise SystemExit('This hostname is your main instance; refusing dev deployment.')
    if cfg.get('environment') != 'development':
        raise SystemExit('environment must be development')
    if not cfg.get('config_path', '/config').startswith('/'):
        raise SystemExit('config_path must be absolute')
    return cfg


def ssh(cfg, mode, payload=None, backup=None):
    global MASTER_STARTED
    if not MASTER_STARTED:
        # Start the master separately: an automatic background master can keep
        # subprocess stdout pipes open after the remote command has finished.
        with tempfile.TemporaryFile() as errors:
            master = subprocess.run(['ssh','-M','-N','-f','-S',CONTROL_PATH,
                '-o','BatchMode=yes','-o','ConnectTimeout=10',
                '-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3',
                '-p',str(int(cfg.get('port',22))),'-l',cfg['user'],'--',cfg['host']],
                stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=errors)
            if master.returncode:
                errors.seek(0)
                return subprocess.CompletedProcess([],master.returncode,b'',errors.read())
        MASTER_STARTED = True
    command = ['python3', '-c', REMOTE, mode, cfg.get('config_path', '/config'), cfg['identity']]
    if backup:
        command.append(backup)
    return subprocess.run(['ssh', '-o', 'ControlMaster=no',
                           '-o', 'ControlPath='+CONTROL_PATH,
                           '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                           '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3',
                           '-p', str(int(cfg.get('port', 22))), '-l', cfg['user'], '--', cfg['host'],
                           shlex.join(command)], input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def archive():
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d%H%M%S')
    base = ROOT / 'custom_components/fridge_assistant'
    version = json.loads((base/'manifest.json').read_text())['version']+'.dev'+stamp
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as tar:
        for p in sorted(base.rglob('*')):
            if not p.is_file() or '__pycache__' in p.parts or p.suffix == '.pyc':
                continue
            data = p.read_bytes()
            if p.name == 'manifest.json':
                obj = json.loads(data);obj['version'] = version
                data = (json.dumps(obj, indent=2)+'\n').encode()
            elif p.suffix == '.js' and 'vendor' not in p.parts:
                text = data.decode()
                text = re.sub(r'(\bfrom\s+["\'])(\.{1,2}/[^"\'?]+\.js)(?:\?[^"\']*)?(["\'])',
                              lambda m: m[1]+m[2]+'?v='+version+m[3], text)
                data = text.encode()
            info = tarfile.TarInfo(str(p.relative_to(base)));info.size = len(data);info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--pair', action='store_true', help='mark the explicitly configured target as development')
    group.add_argument('--check', action='store_true', help='check API and integration startup only')
    group.add_argument('--rollback', metavar='BACKUP', help='restore integration code only, then restart dev')
    parser.add_argument('--timeout', type=int, default=180)
    args = parser.parse_args();cfg = configuration()
    print('Dev target: '+cfg['user']+'@'+cfg['host'], flush=True)
    mode = 'pair' if args.pair else 'status' if args.check else 'rollback' if args.rollback else 'deploy'
    # Verify pairing before doing local tests or transferring source.
    if mode == 'deploy':
        result = ssh(cfg, 'probe')
        if result.returncode:
            sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr);raise SystemExit(1)
        subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-q'], cwd=ROOT, check=True)
    result = ssh(cfg, mode, archive() if mode == 'deploy' else None, args.rollback)
    sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr)
    if result.returncode:
        raise SystemExit(result.returncode)
    if mode in ('pair', 'status'):
        return
    deadline = time.monotonic()+args.timeout
    while time.monotonic() < deadline:
        time.sleep(5)
        result = ssh(cfg, 'status')
        if result.returncode == 0:
            print('Deployment verified: API responding and Fridge Assistant loaded.');return
        if result.returncode in (2,4):
            sys.stdout.buffer.write(result.stdout);raise SystemExit(result.returncode)
    raise SystemExit('Startup not verified. Backup is retained; inspect dev logs and use --rollback BACKUP if needed. No automatic data rollback was performed.')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='fridge-dev-ssh-') as control_dir:
        CONTROL_PATH = str(Path(control_dir)/'connection')
        try:
            main()
        finally:
            if Path(CONTROL_PATH).exists():
                cfg = configuration()
                subprocess.run(['ssh', '-S', CONTROL_PATH, '-O', 'exit', '-p', str(int(cfg.get('port',22))), '-l', cfg['user'], cfg['host']], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
