async function main(workbook: ExcelScript.Workbook) {

    const SUPABASE_URL: string = "https://ykttrpmdytpvkpfuqvza.supabase.co";
    const SUPABASE_KEY: string = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdHRycG1keXRwdmtwZnVxdnphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTAyNTAsImV4cCI6MjA5NDc2NjI1MH0.moNeSzhjYHGf9DBb3pWwQ_AxiIp0xxeOkV1jaXmAKjg";

    const sheet: ExcelScript.Worksheet = workbook.getWorksheet("PROJECT LIST");
    const usedRange: ExcelScript.Range = sheet.getUsedRange();
    const values: (string | number | boolean)[][] = usedRange.getValues();

    const rangeRowOffset: number = usedRange.getRowIndex();
    const rangeColOffset: number = usedRange.getColumnIndex();

    const HEADER_ROW: number = 14;
    const headers: string[] = values[HEADER_ROW].map(
        (h: string | number | boolean) => String(h).trim().toLowerCase()
    );

    const col = (name: string): number => headers.indexOf(name.toLowerCase());

    const get = (row: (string | number | boolean)[], name: string): string => {
        const idx: number = col(name);
        if (idx === -1) return "";
        const v = row[idx];
        return v === null || v === undefined ? "" : String(v).trim();
    };

    const toISO = (val: string): string => {
        if (!val) return "";
        if (val.match(/^\d{4}-\d{2}-\d{2}/)) return val.slice(0, 10);
        const dmy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (dmy) {
            const d = dmy[1].padStart(2, "0");
            const m = dmy[2].padStart(2, "0");
            let y = dmy[3];
            if (y.length === 2) y = "20" + y;
            return `${y}-${m}-${d}`;
        }
        const num = parseFloat(val);
        if (!isNaN(num) && num > 1000) {
            const date = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
            return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
        }
        return "";
    };

    interface TaskRecord {
        id?: number;
        name: string;
        seqf: string | null;
        room: string | null;
        rack_pa: string | null;
        rack_type: string | null;
        wireman: string | null;
        cables_by: string | null;
        project_manager: string | null;
        coordinator: string | null;
        dsp_owner: string | null;
        test_engineer: string | null;
        priority: string | null;
        rack_build_start: string | null;
        rack_build_end: string | null;
        test_start: string | null;
        test_end: string | null;
        fat_date: string | null;
        site_date: string | null;
        status: string | null;
        comments: string | null;
        qty: number;
    }

    const idColIdx: number = col("supabaseid");
    if (idColIdx === -1) {
        console.log("ERROR: 'SupabaseID' column not found in header row. Please add it and try again.");
        return;
    }

    interface RowEntry { rowIdx: number; record: TaskRecord; supabaseId: number | null; }
    const toInsert: RowEntry[] = [];
    const toUpdate: RowEntry[] = [];

    for (let i: number = HEADER_ROW + 1; i < values.length; i++) {
        const row = values[i];
        const name: string = get(row, "ProjectName");
        if (!name) continue;

        const rawId = row[idColIdx];
        const supabaseId: number | null = rawId && !isNaN(Number(rawId)) ? Number(rawId) : null;

        const record: TaskRecord = {
            name,
            seqf: get(row, "SEQF") || null,
            room: get(row, "SystemRoomName") || null,
            rack_pa: get(row, "RACK PA NUMBER") || null,
            rack_type: get(row, "RACK TYPE") || null,
            wireman: get(row, "WIREMAN") || null,
            cables_by: get(row, "CABLES PREPPED BY") || null,
            project_manager: get(row, "ProjectManager") || null,
            coordinator: get(row, "ProjectCoordinator") || null,
            dsp_owner: get(row, "DSP_Owner") || null,
            test_engineer: get(row, "TEST ENGINEER") || null,
            priority: get(row, "PRIORITY") || null,
            rack_build_start: toISO(get(row, "BUILD START DATE")) || null,
            rack_build_end: toISO(get(row, "BUILD END DATE")) || null,
            test_start: toISO(get(row, "TEST START DATE")) || null,
            test_end: toISO(get(row, "TEST END DATE")) || null,
            fat_date: toISO(get(row, "FATDate")) || null,
            site_date: toISO(get(row, "RACK TO SITE DATE")) || null,
            status: get(row, "ProjectStatus") || null,
            comments: get(row, "Notes (dates for build)") || null,
            qty: parseInt(get(row, "QTY")) || 1,
        };

        if (supabaseId) {
            toUpdate.push({ rowIdx: i, record, supabaseId });
        } else {
            toInsert.push({ rowIdx: i, record, supabaseId: null });
        }
    }

    console.log(`${toInsert.length} to insert, ${toUpdate.length} to update`);

    const BATCH: number = 50;
    let inserted: number = 0;
    let updated: number = 0;
    let failed: number = 0;
    const insertErrors: string[] = [];
    const updateErrors: string[] = [];
    const idWrites: { rowIdx: number; id: number }[] = [];

    // ── INSERTS — upsert on name+room to prevent duplicates ──────────
    for (let i: number = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);

        const response: Response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?on_conflict=name,room`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(batch.map(e => e.record)),
        });

        if (response.ok) {
            const rows: { id: number }[] = await response.json();
            for (let j: number = 0; j < batch.length; j++) {
                const id = rows[j]?.id;
                if (id) {
                    idWrites.push({ rowIdx: batch[j].rowIdx, id });
                    inserted++;
                }
            }
        } else {
            const errText = await response.text();
            insertErrors.push(`Insert batch ${Math.floor(i / BATCH) + 1} (status ${response.status}): ${errText}`);
            failed += batch.length;
        }
    }

    // Write IDs back to Excel all at once
    for (const write of idWrites) {
        sheet.getCell(
            rangeRowOffset + write.rowIdx,
            rangeColOffset + idColIdx
        ).setValue(write.id);
    }

    // ── UPDATES — upsert on id ────────────────────────────────────────
    for (let i: number = 0; i < toUpdate.length; i += BATCH) {
        const batch = toUpdate.slice(i, i + BATCH);
        const records = batch.map(e => ({ ...e.record, id: e.supabaseId }));

        const response: Response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?on_conflict=id`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(records),
        });

        if (response.ok) {
            updated += batch.length;
        } else {
            const err = await response.text();
            updateErrors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${err}`);
            failed += batch.length;
        }
    }

    // ── DELETES — remove Supabase records no longer present in Excel ──
    // Build the complete set of IDs that Excel currently knows about:
    // rows that already had an ID (toUpdate) + rows just assigned one (idWrites)
    const excelIds: Set<number> = new Set<number>();
    for (const entry of toUpdate) {
        if (entry.supabaseId) excelIds.add(entry.supabaseId);
    }
    for (const write of idWrites) {
        excelIds.add(write.id);
    }

    let deleted: number = 0;
    const deleteErrors: string[] = [];

    const allIdsResponse: Response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?select=id`, {
        method: "GET",
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
    });

    if (allIdsResponse.ok) {
        const allRows: { id: number }[] = await allIdsResponse.json();
        const toDelete: number[] = allRows.map(r => r.id).filter(id => !excelIds.has(id));

        console.log(`${toDelete.length} to delete (in Supabase but not in Excel)`);

        for (let i: number = 0; i < toDelete.length; i += BATCH) {
            const batchIds = toDelete.slice(i, i + BATCH);
            const idList = batchIds.join(",");

            const delResponse: Response = await fetch(`${SUPABASE_URL}/rest/v1/tasks?id=in.(${idList})`, {
                method: "DELETE",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Prefer": "return=minimal",
                },
            });

            if (delResponse.ok) {
                deleted += batchIds.length;
            } else {
                const errText = await delResponse.text();
                deleteErrors.push(`Delete batch ${Math.floor(i / BATCH) + 1} (status ${delResponse.status}): ${errText}`);
            }
        }
    } else {
        const errText = await allIdsResponse.text();
        deleteErrors.push(`Failed to fetch Supabase IDs for delete check (status ${allIdsResponse.status}): ${errText}`);
    }

    // ── SUMMARY ───────────────────────────────────────────────────────
    let summary = `Done: ${inserted} inserted/merged, ${updated} updated, ${deleted} deleted, ${failed} failed`;
    if (insertErrors.length > 0) summary += `\nInsert errors: ${insertErrors.join("; ")}`;
    if (updateErrors.length > 0) summary += `\nUpdate errors: ${updateErrors.join("; ")}`;
    if (deleteErrors.length > 0) summary += `\nDelete errors: ${deleteErrors.join("; ")}`;
    console.log(summary);
}
