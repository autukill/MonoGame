"""Summarize three independent, bounded NativeAOT control runs per runtime."""
import argparse
import json
from pathlib import Path
from statistics import median

parser = argparse.ArgumentParser()
parser.add_argument("input", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
cases = ("official", "same-source-unpatched", "maintained")
fields = ("WorkingSetBytes", "PrivateBytes", "PeakWorkingSetBytes", "CpuSeconds")
result = {"sampleSeconds": [5, 15, 30, 60], "runsPerCase": 3, "units": {"memory": "MiB", "CPU": "cumulative seconds and logical-core equivalents"}, "cases": {}}
for case in cases:
    runs = [json.loads((args.input / f"{case}-{n}" / "process.json").read_text(encoding="utf-8-sig")) for n in range(1, 4)]
    for run in runs:
        assert run["Completed"] and run["Exited"] and run["ExpectedAot"] and run["NoForcedGc"] and not run["Diagnostic"]
        assert len(run["Samples"]) == 4
        assert all(sample["WindowHandle"] != 0 for sample in run["Samples"])
        assert run["NativeModules"] and all(module["Sha256"] == run["NativeSha256"] for module in run["NativeModules"])
        assert not any(module["Name"].lower() in ("coreclr.dll", "clrjit.dll") for module in run["Modules"])
    assert len({run["ExeSha256"] for run in runs}) == 1
    rows = []
    for index, nominal in enumerate(result["sampleSeconds"]):
        samples = [run["Samples"][index] for run in runs]
        assert all(abs(sample["Seconds"] - nominal) < 1.5 for sample in samples)
        row = {"seconds": nominal}
        for field in fields:
            values = [sample[field] / (1024 * 1024 if field.endswith("Bytes") else 1) for sample in samples]
            row[field.replace("Bytes", "MiB")] = {"min": min(values), "median": median(values), "max": max(values)}
        values = [sample["CpuSeconds"] / sample["Seconds"] for sample in samples]
        row["CpuCoreEquivalent"] = {"min": min(values), "median": median(values), "max": max(values)}
        rows.append(row)
    result["cases"][case] = {"nativeSha256": runs[0]["NativeSha256"], "exeSha256": runs[0]["ExeSha256"], "processes": [{"pid": run["Pid"], "startedUtc": run["StartedUtc"]} for run in runs], "samples": rows}
assert len({entry["exeSha256"] for entry in result["cases"].values()}) == 1
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print("PASS nine independent visible NativeAOT controls; identical EXE, verified actual native hashes; no forced GC.")
