<?php

namespace App\Services;

use App\Models\{Organization, SystemBackup, User};
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Process\Process;
use ZipArchive;

class DatabaseBackupService
{
    public function create(Organization $organization, ?User $user, bool $uploads): SystemBackup
    {
        abort_unless(class_exists(ZipArchive::class), 500, 'PHP ZIP extension is required.');

        $stamp = now()->format('Y-m-d_H-i-s');
        $base = 'stockflow-'.$organization->id.'-'.$stamp;
        $dir = storage_path('app/private/backups/'.$organization->id);
        if (! is_dir($dir) && ! mkdir($dir, 0750, true) && ! is_dir($dir)) {
            throw new RuntimeException('Unable to create the private backup directory.');
        }

        $sql = $dir.'/'.$base.'.sql';
        $zipPath = $dir.'/'.$base.'.zip';

        try {
            $this->dumpDatabase($sql);
        } catch (\Throwable $exception) {
            @unlink($sql);
            throw $exception;
        }

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($sql);
            throw new RuntimeException('Unable to create backup archive.');
        }

        $zip->addFile($sql, 'database.sql');
        if ($uploads) $this->addUploads($zip);
        $zip->close();
        @unlink($sql);

        $relative = 'backups/'.$organization->id.'/'.$base.'.zip';
        $backup = SystemBackup::create([
            'organization_id' => $organization->id,
            'created_by' => $user?->id,
            'filename' => $base.'.zip',
            'disk' => 'local',
            'path' => $relative,
            'size' => filesize($zipPath),
            'checksum' => hash_file('sha256', $zipPath),
            'includes_uploads' => $uploads,
            'status' => 'completed',
        ]);

        $this->prune($organization);
        return $backup;
    }

    private function dumpDatabase(string $sql): void
    {
        $connection = config('database.connections.mysql');
        $configuredHost = trim((string) ($connection['host'] ?? '127.0.0.1'));
        $primaryHost = strtolower($configuredHost) === 'localhost' ? '127.0.0.1' : $configuredHost;
        $hosts = array_values(array_unique(array_filter([$primaryHost, '127.0.0.1'])));
        $errors = [];

        foreach ($hosts as $host) {
            for ($attempt = 1; $attempt <= 2; $attempt++) {
                $args = [
                    $this->dumpBinary(),
                    '--protocol=tcp',
                    '--host='.$host,
                    '--port='.(string) ($connection['port'] ?? '3306'),
                    '--user='.(string) ($connection['username'] ?? 'root'),
                    '--single-transaction',
                    '--routines',
                    '--triggers',
                    '--result-file='.$sql,
                ];
                $password = (string) ($connection['password'] ?? '');
                if ($password !== '') $args[] = '--password='.$password;
                $args[] = (string) ($connection['database'] ?? '');

                $process = new Process($args, base_path());
                $process->setTimeout(600);
                $process->run();

                if ($process->isSuccessful() && is_file($sql) && filesize($sql) > 0) return;
                $error = trim($process->getErrorOutput()) ?: trim($process->getOutput()) ?: 'No diagnostic output was returned.';
                $errors[] = $host.': '.$error;
                @unlink($sql);
                if ($attempt === 1) usleep(250000);
            }
        }

        throw new RuntimeException('Database export failed: '.implode(' | ', array_unique($errors)));
    }

    private function dumpBinary(): string
    {
        $configured = trim((string) env('MYSQLDUMP_PATH', ''));
        $candidates = array_filter([
            $configured,
            PHP_OS_FAMILY === 'Windows' ? 'C:\\xampp\\mysql\\bin\\mysqldump.exe' : null,
            'mysqldump',
        ]);

        foreach ($candidates as $candidate) {
            if ($candidate === 'mysqldump' || is_file($candidate)) return $candidate;
        }

        throw new RuntimeException('mysqldump was not found. Set MYSQLDUMP_PATH in the backend environment.');
    }

    private function addUploads(ZipArchive $zip): void
    {
        $root = storage_path('app/public');
        if (! is_dir($root)) return;

        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->isFile()) $zip->addFile($file->getPathname(), 'uploads/'.str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1)));
        }
    }

    public function prune(Organization $organization): void
    {
        $days = (int) data_get($organization->settings, 'backup.retention_days', 30);
        $old = SystemBackup::where('organization_id', $organization->id)->where('created_at', '<', now()->subDays(max(1, $days)))->get();
        foreach ($old as $backup) {
            Storage::disk($backup->disk)->delete($backup->path);
            $backup->delete();
        }
    }
}
