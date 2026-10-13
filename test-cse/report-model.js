function createReportModel(inspection) {
    const model = JSON.parse(JSON.stringify(inspection));
    model.general ||= {};
    model.siteSnapshot ||= {};
    const site = model.siteSnapshot;
    site.cseName = site.cseName ?? (typeof site.cse === "string" ? site.cse : "");
    site.responsibleForWorks = site.responsibleForWorks ?? site.responsabileLavori ?? model.general.respLavori ?? "";
    model.completionStatus ||= "COMPLETATO";
    model.findings = (model.findings || []).map((finding, index) => {
        const legacy = model.legacyFindingLayout || !Array.isArray(model.photos);
        const reportPhotos = index === 0 && Array.isArray(model.photos) ? model.photos : [];
        const findingPhotos = finding.photos || [];
        const photos = reportPhotos.some(Boolean)
            ? (findingPhotos.some(Boolean) ? [...reportPhotos, ...findingPhotos].filter(Boolean) : reportPhotos)
            : findingPhotos;
        const photoGroups = [];
        for (let i = 0; i < photos.length; i += 2) photoGroups.push(photos.slice(i, i + 2));
        return {
            ...finding,
            number: finding.number || index + 1,
            pdfDescription: legacy
                ? [...new Set([finding.activityDescription, finding.observation].filter(Boolean))].join("\n\n")
                : finding.activityDescription || "",
            pdfPhotoGroups: photoGroups,
            showPhotoFrame: legacy || index === 0 || findingPhotos.some(Boolean)
        };
    });
    return model;
}
