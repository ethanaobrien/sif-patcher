function update_status(status) {
    console.log(status);
    document.getElementById("status").innerText = status;
}

async function patch(file, android, newDomain, patches) {
    if (newDomain.endsWith("/")) newDomain = newDomain.slice(0, -1);

    if (!file) {
        console.log("downloading");
        update_status("Downloading...");
        const url = android ? "https://ethanthesleepy.one/public/lovelive/sif/localhost/lovelive-community.apk" : "https://ethanthesleepy.one/public/lovelive/sif/iOS/lovelive-community-OLD.ipa";
        file = await (await fetch(url)).blob();
        console.log("downloaded");
    }
    console.log("loaded");
    update_status("Opening file");
    const zip = new JSZip();
    await zip.loadAsync(file);
    update_status("Getting current config");

    let basePath = android ? "" : "Payload/LoveLive.app/";
    let server_file;
    if (android) {
        let server_info = await zip.file("assets/AppAssets.zip").async("arraybuffer");
        const zip2 = new JSZip();
        await zip2.loadAsync(server_info);
        server_file = await zip2.file("config/server_info.json").async("arraybuffer");
    } else {
        server_file = await zip.file("Payload/LoveLive.app/ProjectResources/config/server_info.json").async("arraybuffer");
    }

    let postPatches = [];
    for (let i=0; i<patches.length; i++) {
        let patch = patches[i];
        if (!patch.checked) continue;
        for (let j=0; j<patch.files.length; j++) {
            let file = patch.files[j];
            if (android && file.outpath.startsWith("assets/")) {
                postPatches.push(file);
                continue;
            }
            console.log("Downloading patch", file.path);
            let res = await fetch(file.path);
            if (!res.ok) {
                console.warn("Error downloading patch");
                continue;
            }
            zip.file(basePath + file.outpath, await res.blob());
        }
    }

    //console.log(server_file);
    FS.writeFile("/server_info.json", new Uint8Array(server_file));
    update_status("Decrypting");
    Module.callMain(["server_info.json"]);
    update_status("Patching domain");
    const data = FS.readFile("/server_info.json", {encoding: 'utf8'});
    const currentData = JSON.parse(data);
    const currentDomain = currentData.domain;
    const newData = data.split(currentDomain).join(newDomain);
    FS.writeFile("/server_info.json", newData);
    update_status("Encrypting");
    Module.callMain(["-e", "-j", "server_info.json"]);
    const new_server_info = FS.readFile("/server_info.json");

    let type;
    let ext;
    update_status("Applying changes");
    if (android) {
        let server_info = await zip.file("assets/AppAssets.zip").async("arraybuffer");
        const zip2 = new JSZip();
        await zip2.loadAsync(server_info);
        zip2.file("config/server_info.json", new_server_info);

        for (let i=0; i<postPatches.length; i++) {
            let file = postPatches[i];
            console.log("Downloading patch", file.path);
            let res = await fetch(file.path);
            if (!res.ok) {
                console.warn("Error downloading patch");
                continue;
            }
            zip2.file(basePath + file.outpath, await res.blob());
        }

        const appAssets = await zip2.generateAsync({type: "uint8array"});
        zip.file("assets/AppAssets.zip", appAssets);
        zip.file("assets/version", "MD5 (AppAssets.zip) = " + CryptoJS.MD5(appAssets).toString());
        type = "application/vnd.android.package-archive";
        ext = "apk";
    } else {
        zip.file("Payload/LoveLive.app/ProjectResources/config/server_info.json", new_server_info);
        type = "application/octet-stream";
        ext = "ipa";
    }
    let finalized = await zip.generateAsync({type: "uint8array"});
    update_status("Finalizing");
    const downloadUrl = URL.createObjectURL(new Blob([finalized], {type: type}));
    const b = document.createElement("a");
    b.href = URL.createObjectURL(new Blob([new_server_info], {type: "application/json"}))
    b.innerText = "Download patched server_info.json (you probably dont need this)";
    b.download = "server_info.json";
    document.body.appendChild(b);

    document.body.appendChild(document.createElement("br"));
    document.body.appendChild(document.createElement("br"));

    const a = document.createElement("a");
    a.href = downloadUrl;
    a.innerText = "Download";
    a.download = "lovelive-patched."+ext;
    document.body.appendChild(a);
    update_status("Done!");
    if (android) {
        const p = document.createElement("p");
        p.innerHTML = "Package is not signed. Using <a href=\"https://github.com/patrickfav/uber-apk-signer/releases\">uber-apk-signer</a>, sign it with the command `java -jar uber-apk-signer-<version>.jar -a lovelive.apk`.";
        document.body.appendChild(p);
    }
}

function init_honoka(file, android, newDomain, patches) {
    window.Module = {
        noInitialRun: true,
        onRuntimeInitialized: async function() {
            try {
                await patch(file, android, newDomain, patches);
            } catch(e) {
                console.warn(e);
                document.getElementById("status").innerText = "It didnt work. Are your files/options invalid?";
            }
        },
        arguments: [],
        preRun: [],
        postRun: [],
        print: (msg) => {
            console.log(msg);
        },
        printErr: (msg) => {
            console.log(msg);
        },
        totalDependencies: 0,
        monitorRunDependencies: () => {},
        locateFile: function(fileName) {
            console.log("locateFile", fileName);
            return fileName;
        }
    };
    const script = document.createElement("script")
    script.src = "libhonoka.js";
    document.body.appendChild(script);
};
