const fs = require("mz/fs");
const childProcess = require("mz/child_process");
const os = require("os");
const platform = os.platform();

const CONFIG_DIR = `${process.env.HOME}/.mehserve`;

function run(binary, args, options) {
  const cp = childProcess.spawn(binary, args, options);
  return new Promise((resolve, reject) => {
    cp.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${binary} exited with status '${code}'`));
      }
    });
  });
}

exports.createSSLCertificateFor = async function createSSLCertificateFor(
  hostname
) {
  if (!hostname || !hostname.match(/^[a-z0-9][a-z0-9-_.]+$/)) {
    throw new Error(
      `Unsupported hostname '${hostname}' (hints: use lower case; only alphanumeric, hyphen, underscore, dot; must start alphanumeric)`
    );
  }

  const configSrc = `${CONFIG_DIR}/${hostname}.ssl.cnf`;
  const keyDest = `${CONFIG_DIR}/${hostname}.ssl.key`;
  const certDest = `${CONFIG_DIR}/${hostname}.ssl.crt`;
  await fs.writeFile(
    configSrc,
    `\
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = ${hostname}
[v3_req]
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = ${hostname}
DNS.2 = ${hostname}.meh
DNS.3 = ${hostname}.dev
`
  );

  await run("openssl", [
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-days",
    "3650",
    "-nodes",
    "-x509",
    "-keyout",
    keyDest,
    "-out",
    certDest,
    "-config",
    configSrc,
  ]);
  await fs.unlink(configSrc);
  console.log("SSL certificate successfully generated");

  if (platform === "darwin") {
    console.log(`\

================================================================================

We'll open Keychain Access in a moment. Here are the instructions what to do:

1. Click "Add"
2. Find the certificate (e.g. "${hostname}") in the "Certificates" category,
   select it, and click the [ｉ] button at the bottom
3. In the popup window, click the ▶ button to the left of 'Trust', and select
   'Always Trust' for 'When using this certificate:'.
4. Close the popup window.
5. When prompted, enter your password again and click Update Settings.
6. Quit Keychain Access.

Press enter to continue
`);

    await run("open", [
      "-a",
      "/Applications/Utilities/Keychain Access.app",
      certDest,
    ]);
  } else if (platform === "linux") {
    console.log(`\

On Ubuntu the following shell commands should install the SSL certificate and
have it trusted by system utilities and Chrome. You may need to adjust these
instructions for other platforms.

    sudo mkdir -p /usr/local/share/ca-certificates/mehserve
    sudo cp "$HOME/.mehserve/${hostname}.ssl.crt" "/usr/local/share/ca-certificates/mehserve/${hostname}.ssl.crt"
    sudo update-ca-certificates
    certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "${hostname}" -i "$HOME/.mehserve/${hostname}.ssl.crt"
`);
  } else {
    console.log(
      `We don't have instructions for '${platform}' yet (PRs are welcome!); you need to add '${certDest}' as a trusted certificate`
    );
  }
};
