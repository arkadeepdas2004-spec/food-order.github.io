const { createCipheriv, randomBytes, createHash } = require("crypto");
const { createReadStream, createWriteStream, mkdirSync, unlinkSync } = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const dbName = process.env.MYSQL_DATABASE || process.env.DB_NAME || "food_order";
const dbHost = process.env.MYSQL_HOST || process.env.DB_HOST || "localhost";
const dbPort = process.env.MYSQL_PORT || process.env.DB_PORT || "3306";
const dbUser = process.env.MYSQL_BACKUP_USER || process.env.MYSQL_USER || process.env.DB_USER || "root";
const dbPassword = process.env.MYSQL_BACKUP_PASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "";
const backupDir = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || "";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function encryptFile(inputPath, outputPath, passphrase) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = createHash("sha256").update(passphrase).update(salt).digest();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);

    output.write(Buffer.from("FBDBENC1"));
    output.write(salt);
    output.write(iv);

    input.pipe(cipher).pipe(output, { end: false });
    cipher.on("end", () => {
      output.write(cipher.getAuthTag());
      output.end();
    });
    output.on("finish", () => {
      resolve();
    });
    input.on("error", reject);
    cipher.on("error", reject);
    output.on("error", reject);
  });
}

async function main() {
  mkdirSync(backupDir, { recursive: true });
  const dumpPath = path.join(backupDir, `${dbName}-${timestamp()}.sql`);
  const args = [
    `--host=${dbHost}`,
    `--port=${dbPort}`,
    `--user=${dbUser}`,
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "--set-gtid-purged=OFF",
    dbName
  ];
  const env = { ...process.env };
  if (dbPassword) env.MYSQL_PWD = dbPassword;

  await new Promise((resolve, reject) => {
    const output = createWriteStream(dumpPath, { mode: 0o600 });
    const dump = spawn("mysqldump", args, { env, stdio: ["ignore", "pipe", "inherit"] });
    dump.stdout.pipe(output);
    dump.on("error", reject);
    dump.on("close", code => {
      output.end();
      if (code === 0) resolve();
      else reject(new Error(`mysqldump exited with code ${code}`));
    });
  });

  if (!encryptionKey) {
    console.log(`Database backup written to ${dumpPath}`);
    return;
  }

  const encryptedPath = `${dumpPath}.enc`;
  await encryptFile(dumpPath, encryptedPath, encryptionKey);
  unlinkSync(dumpPath);
  console.log(`Encrypted database backup written to ${encryptedPath}`);
}

main().catch(error => {
  console.error(`Database backup failed: ${error.message}`);
  process.exit(1);
});
