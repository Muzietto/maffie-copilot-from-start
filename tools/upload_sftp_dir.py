#!/usr/bin/env python3
"""Recursively upload a local directory to a remote server over SFTP (SSH).

Requires: paramiko (install with `pip install paramiko`).

Usage examples:
    # password auth (prompts for password):
    python tools/upload_sftp_dir.py --host sftp.example.com --user alice --local ./dist --remote /var/www/myapp

    # key auth (pass path to private key file):
    # Note: use forward slashes in these examples to avoid Python source escape issues.
    python tools/upload_sftp_dir.py --host sftp.example.com --user alice --key C:/Users/alice/.ssh/id_rsa --local ./dist --remote /var/www/myapp

This script connects with Paramiko, creates remote directories as needed,
and uploads files in binary mode.
"""
from __future__ import annotations
import argparse
import getpass
import os
import posixpath
import sys
import stat

try:
    import paramiko
except ImportError:  # pragma: no cover - user will install locally
    print('This script requires paramiko. Install with: pip install paramiko')
    raise


# Optional defaults: set these here to avoid passing CLI args.
# Example:
# DEFAULT_HOST = 'example.com'
# DEFAULT_USER = 'alice'
# DEFAULT_PASSWORD = None  # or 's3cr3t'
# DEFAULT_LOCAL_DIR = r'C:\path\to\build'
# DEFAULT_REMOTE_DIR = '/var/www/site'
# DEFAULT_PORT = 22
DEFAULT_HOST = 'ftp.faustinelli.net'
DEFAULT_USER = 'muzietto'
DEFAULT_PASSWORD = 'Porco$1234$Muzie'
DEFAULT_LOCAL_DIR = None
DEFAULT_REMOTE_DIR = '/birille.faustinelli.net/httpdocs/AI/marco_copilot'
DEFAULT_PORT = 72
DEFAULT_ALLOW_MISSING_HOST_KEY = True

# Optional whitelist of file extensions to upload. If set to a list of extensions
# (example: ['.html', '.css', '.js', '.png']), only files with those
# extensions will be uploaded. Extensions are compared case-insensitively and
# may be provided with or without a leading dot. If None or empty, all files
# will be uploaded.
DEFAULT_FILE_EXTENSIONS_TO_UPLOAD = [
    'html', 
    'css', 
    'js', 
    'svg'
    ]

# Optional list of directory names to skip when walking the local tree.
# Example: DEFAULT_SKIP_DIRS = ['.git', '__pycache__']
# Names are matched case-insensitively against directory basenames and will
# prevent os.walk from descending into those directories.
DEFAULT_SKIP_DIRS = [
    '.git',
    'tools'
    ]

def parse_args(argv=None):
    p = argparse.ArgumentParser(description='Upload a local directory via SFTP (Paramiko)')
    p.add_argument('--host', required=False, help='SFTP host')
    p.add_argument('--port', type=int, default=None, help='SSH port (default 22)')
    p.add_argument('--user', required=False, help='SSH username')
    p.add_argument('--password', help='Password (omit to prompt)')
    p.add_argument('--key', help='Path to private key file for key-based auth')
    p.add_argument('--local', required=False, help='Local directory to upload')
    p.add_argument('--remote', required=False, help='Remote target directory (posix style)')
    p.add_argument('--allow-missing-host-key', action='store_true', help='Automatically add unknown host keys (less secure)')
    return p.parse_args(argv)


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    """Create remote directory and parents as needed (posix-style path)."""
    # Normalize
    parts = [p for p in remote_dir.split('/') if p]
    if not parts:
        return
    cur = ''
    for part in parts:
        cur = posixpath.join(cur, part)
        try:
            sftp.stat(cur)
        except IOError:
            try:
                sftp.mkdir(cur)
            except Exception as e:
                print(f'Warning: could not create remote dir {cur}: {e}')


def clear_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    """Recursively remove files and directories under remote_dir.

    This will remove files and recursively remove subdirectories, but will
    leave the top-level remote_dir itself (so it can be reused).
    """
    try:
        for entry in sftp.listdir_attr(remote_dir):
            name = entry.filename
            path = posixpath.join(remote_dir, name)
            try:
                mode = entry.st_mode
            except Exception:
                # Fallback: try stat on the path
                try:
                    mode = sftp.stat(path).st_mode
                except Exception:
                    print(f'Warning: could not stat remote entry {path}, skipping')
                    continue

            if stat.S_ISDIR(mode):
                # recurse into directory
                clear_remote_dir(sftp, path)
                try:
                    sftp.rmdir(path)
                except Exception as e:
                    print(f'Warning: could not remove remote dir {path}: {e}')
            else:
                try:
                    sftp.remove(path)
                except Exception as e:
                    print(f'Warning: could not remove remote file {path}: {e}')
    except IOError:
        # remote_dir may not exist yet
        return


def remove_empty_remote_dirs(sftp: paramiko.SFTPClient, remote_dir: str) -> bool:
    """Recursively remove empty subdirectories under remote_dir.

    Returns True if remote_dir is empty after cleanup, False otherwise.
    The function WILL NOT remove the provided remote_dir itself; it will only
    remove empty child directories under it.
    """
    try:
        entries = sftp.listdir_attr(remote_dir)
    except IOError:
        return True

    is_empty = True
    for entry in entries:
        name = entry.filename
        path = posixpath.join(remote_dir, name)
        try:
            mode = entry.st_mode
        except Exception:
            try:
                mode = sftp.stat(path).st_mode
            except Exception:
                # if we can't stat, assume it's not empty/unknown and skip
                is_empty = False
                continue

        if stat.S_ISDIR(mode):
            # Recurse into child directory
            child_empty = remove_empty_remote_dirs(sftp, path)
            # If child is empty, try to remove it
            if child_empty:
                try:
                    sftp.rmdir(path)
                    print(f'Removed empty remote dir {path}')
                except Exception as e:
                    print(f'Warning: could not remove remote dir {path}: {e}')
                    is_empty = False
            else:
                is_empty = False
        else:
            is_empty = False

    return is_empty


def upload_dir(sftp: paramiko.SFTPClient, local_root: str, remote_root: str) -> None:
    local_root = os.path.abspath(local_root)
    if not os.path.isdir(local_root):
        raise SystemExit(f'Local path is not a directory: {local_root}')
    # Normalize whitelist (if any) to a set of lowercase extensions with a leading dot
    wl = None
    if DEFAULT_FILE_EXTENSIONS_TO_UPLOAD:
        wl = set()
        for e in DEFAULT_FILE_EXTENSIONS_TO_UPLOAD:
            if not e:
                continue
            ee = e.lower()
            if not ee.startswith('.'):
                ee = '.' + ee
            wl.add(ee)

    # Normalize skip directory names (if any) to a lowercase set for quick checks.
    skip_set = None
    if DEFAULT_SKIP_DIRS:
        skip_set = set([d.lower() for d in DEFAULT_SKIP_DIRS if d])

    for dirpath, dirnames, filenames in os.walk(local_root):
        # If skip_set is configured, mutate dirnames in-place so os.walk will
        # not descend into those directories.
        if skip_set:
            dirnames[:] = [d for d in dirnames if d.lower() not in skip_set]
        rel = os.path.relpath(dirpath, local_root)
        if rel == '.':
            remote_dir = remote_root
        else:
            remote_dir = posixpath.join(remote_root, *rel.split(os.sep))
        ensure_remote_dir(sftp, remote_dir)
        # upload files
        for fname in filenames:
            # If a whitelist is configured, skip files whose extension isn't listed
            if wl is not None:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in wl:
                    continue

            local_file = os.path.join(dirpath, fname)
            remote_file = posixpath.join(remote_dir, fname)
            print(f'Uploading {local_file} -> {remote_file}')
            try:
                sftp.put(local_file, remote_file)
            except Exception as e:
                print(f'Error uploading {local_file}: {e}')


def main(argv=None):
    args = parse_args(argv)

    # Merge CLI args with file-level defaults (DEFAULT_* variables above).
    args.host = args.host or DEFAULT_HOST
    args.user = args.user or DEFAULT_USER
    args.password = args.password or DEFAULT_PASSWORD
    # Use provided local dir, or DEFAULT_LOCAL_DIR, otherwise fall back to the
    # current working directory (project root when run from repo root).
    args.local = args.local or DEFAULT_LOCAL_DIR or os.getcwd()
    args.remote = args.remote or DEFAULT_REMOTE_DIR

    # Merge port default: CLI -> DEFAULT_PORT -> 22
    if args.port is None:
        args.port = DEFAULT_PORT if DEFAULT_PORT is not None else 22

        # Merge allow-missing-host-key: CLI flag or DEFAULT_ALLOW_MISSING_HOST_KEY
        args.allow_missing_host_key = args.allow_missing_host_key or DEFAULT_ALLOW_MISSING_HOST_KEY
    # Basic validation after merging defaults
    missing = []
    if not args.host:
        missing.append('--host or DEFAULT_HOST')
    if not args.user:
        missing.append('--user or DEFAULT_USER')
    # args.local always has a value now (possibly os.getcwd()), so no missing check needed for it.
    if not args.remote:
        missing.append('--remote or DEFAULT_REMOTE_DIR')
    if missing:
        print('Missing required parameters:', ', '.join(missing))
        print('Either pass them as CLI args or set the DEFAULT_* variables at the top of this script.')
        raise SystemExit(2)

    password = args.password or (getpass.getpass(f'Password for {args.user}@{args.host}: ') if not args.key else None)

    # Setup SSH client
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    if args.allow_missing_host_key:
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    else:
        ssh.set_missing_host_key_policy(paramiko.RejectPolicy())

    pkey = None
    if args.key:
        # try to load private key (support rsa/ecdsa/ed25519)
        try:
            pkey = paramiko.RSAKey.from_private_key_file(args.key)
        except Exception:
            try:
                pkey = paramiko.Ed25519Key.from_private_key_file(args.key)
            except Exception:
                try:
                    pkey = paramiko.ECDSAKey.from_private_key_file(args.key)
                except Exception as e:
                    print('Failed to load private key:', e)
                    raise

    try:
        ssh.connect(args.host, port=args.port, username=args.user, password=password, pkey=pkey)
    except Exception as e:
        print('SSH connect failed:', e)
        raise SystemExit(1)

    try:
        sftp = ssh.open_sftp()
        try:
            ensure_remote_dir(sftp, args.remote)
            # Clear the remote directory before uploading (whitelist still applies).
            clear_remote_dir(sftp, args.remote)
            upload_dir(sftp, args.local, args.remote)
            # Remove any empty remote subdirectories left over from traversal
            try:
                remove_empty_remote_dirs(sftp, args.remote)
            except Exception as e:
                print(f'Warning: failed to prune empty remote directories: {e}')
        finally:
            sftp.close()
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
