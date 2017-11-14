import {showError} from "../utils.js";
import {showNotification} from "../notifications.js";

/**
 * creates a myGenomes object representing the table showing all self uploaded
 * genomes and optiones to add or remove them.
 *
 * @param <String> args.version The uniprot version
 * @param <String> args.pancore The pancore object
 */
function constructMyGenomes(args) {
    /** ************* Private variables ***************/

    let that = {},
        version = args.version,
        pancore = args.pancore,
        worker;

    // Data vars
    let promisesProcess = new Map(),
        genomes,
        genomeList,
        genomesPromise,
        genomesResolver;

    // Data storage
    let indexedDBStore = {},
        localStorageStore = {},
        dataStore;

    // Page elements
    let $myGenomesDiv = $("#myGenomes"),
        $myGenomesTable = $("#my-genomes-table tbody"),
        $myGenomesButton = $("#addMyGenomeButton"),
        $popover;

    /** ************* Private methods ***************/

    /**
     * Initializes the table
     */
    function init() {
        genomes = {};
        genomeList = [];

        genomesPromise = new Promise( function (resolve, reject) {
            genomesResolver = resolve;
        });

        if (window.indexedDB && navigator.vendor.indexOf("Apple") === -1) {
            dataStore = indexedDBStore;
        } else {
            dataStore = localStorageStore;
        }

        dataStore.init();

        // init worker
        // Create the Javascript Worker for background data processing
        worker = new Worker("/assets/workers/mygenome_worker.js");
        worker.addEventListener("message", handleWorkerMessage, false);
        worker.addEventListener("error", showError, false);

        // init popover
        $myGenomesButton.popover({
            html: true,
            trigger: "manual",
            title: function () {
                return $("#mygenomes-popover-head").html();
            },
            content: function () {
                return $("#mygenomes-popover-content").html();
            },
            container: "body",
        });

        // enable add my genome button
        $myGenomesButton.click(function () {
            if (!$popover) {
                $myGenomesButton.popover("show");
            } else {
                $popover.toggleClass("hide");
                repositionPopover();
            }
        });

        // enable remove all button
        $("#remove-my-genomes").click(removeAllGenomes);
        $myGenomesDiv.find(".btn-add-all").click(addAllGenomes);

        // add pop-over behaviour
        $myGenomesButton.on("shown.bs.popover", initPopoverBehaviour);

        // help
        $("#my-genomes-help").tooltip({placement: "right", container: "body"});

        // set visible
        $myGenomesDiv.removeClass("hide");
    }

    /**
     * Handles message events from the worker
     *
     * @param <Event> e The event we want to handle
     */
    function handleWorkerMessage(e) {
        /* eslint-disable no-console */
        let data = e.data;
        switch (data.type) {
        case "log":
            console.log(data.msg);
            break;
        case "processConvertedGenome":
            processConvertedGenome(data.msg);
            break;
        case "processProgress":
            processProgress(data.msg.progress);
            break;
        default:
            console.log(data.msg);
        }
        /* eslint-enable no-console */
    }

    /**
     * Sends a command and message to the worker
     */
    function sendToWorker(command, message) {
        worker.postMessage({"cmd": command, "msg": message});
    }

    /**
     * Add the behaviour to the add genomes popover
     */
    function initPopoverBehaviour() {
        // hide the popover
        $popover = $(".popover-content #myGenomeName").parents(".popover");

        repositionPopover();

        // add pop-over hide behaviour
        $(document).click(function (e) {
            if ($popover &&
                !$popover.hasClass("hide") &&
                !$popover.get(0).contains(e.target) &&
                !$myGenomesButton.get(0).contains(e.target)) {
                $popover.addClass("hide");
            }
        });

        // enable the tooltips
        $(".popover-content #myGenomeName").tooltip({placement: "right", trigger: "hover", container: "body"});
        $(".popover-content #myGenomeFile").parents(".input-group").tooltip({placement: "right", trigger: "hover", container: "body"});

        // enable file chooser
        $(".popover-content #myGenomeFile").on("change", function () {
            let $input = $(this),
                numFiles = $input.get(0).files ? $input.get(0).files.length : 1,
                label = $input.val().replace(/\\/g, "/").replace(/.*\//, ""),
                multi = numFiles > 1,
                log = multi ? numFiles + " files selected" : label;
            $input.parents(".input-group").find(":text").val(log);
            if (multi) {
                $(".popover-content #myGenomeName").prop("disabled", true).val("").attr("placeholder", "filenames will be used as name").data("multi", "multi");
            } else {
                $(".popover-content #myGenomeName").prop("disabled", false).attr("placeholder", "name").data("multi", "");
            }
        });

        // hook up the button
        $(".popover-content #processMyGenomeButton").click(function () {
            let multi = $(".popover-content #myGenomeName").data("multi") === "multi",
                name = $(".popover-content #myGenomeName").val(),
                files = $(".popover-content #myGenomeFile").prop("files"),
                dataFiles = [],
                i,
                $notification,
                id = "u" + new Date().getTime();

            $popover.find(".invalid-file").remove();

            // Form validation
            $(".popover-content #myGenomeName").parents(".form-group")
                .toggleClass("has-error", !files[0] || !(multi || name));

            // Handle form
            if (multi || (name && files[0])) {
                $(this).prop("disabled", true).addClass("hide");
                $(".popover-content #myGenomeFile").prop("disabled", true);
                $(".popover-content #myGenomeProgress").removeClass("hide");
                for (i = 0; i < files.length; i++) {
                    dataFiles.push({name: name || files[i].name, file: files[i], id: id + i});
                }
                $notification = showNotification("Processing proteomes...", {
                    loading: true,
                    autoHide: false,
                });
                handleFiles(dataFiles).then(function () {
                    $notification.hide();
                });
            }
        });
    }

    /**
     * Repositions the popover
     */
    function repositionPopover() {
        if (!$popover) return;

        let fullScreen = $(".full-screen-container").hasClass("full-screen");
        if (fullScreen) {
            $popover.appendTo(".full-screen-container");
        } else {
            $popover.appendTo("body");
        }
        let buttonOffset = $myGenomesButton.offset(),
            containerOffset = $(".full-screen-container").hasClass("full-screen") ? $(".full-screen-container").offset() : $("body").offset();
        $popover.css("left", buttonOffset.left - containerOffset.left + 215);
        $popover.css("top", buttonOffset.top - containerOffset.top - 150);
        $popover.css("z-index", 10);
    }

    /**
     * Process a list of files
     */
    function handleFiles(dataFiles) {
        let i = 1,
            totalFiles = dataFiles.length;
        processProgress(0);
        $(".popover-content #myGenomeProgress .progress-text").text("Processing file 1 of " + totalFiles);
        return dataFiles.reduce(function (promise, data) {
            return promise.then(function () {
                return readFile(data.file);
            }).then(function (content) {
                return processFileContent(content, data.name, data.id);
            }).then(function () {
                $(".popover-content #myGenomeProgress .progress-text").text("Processing file " + (++i) + " of " + totalFiles);
            });
        }, Promise.resolve()).then(resetForm);
    }

    /**
     * Reset the add my genome form
     */
    function resetForm() {
        // reset the form
        $(".popover-content #processMyGenomeButton").parents("form").trigger("reset");
        $(".popover-content #myGenomeName").prop("disabled", false).attr("placeholder", "name").data("multi", "");
        $(".popover-content #processMyGenomeButton").removeAttr("disabled");
        $(".popover-content #myGenomeFile").prop("disabled", false);
        $(".popover-content #processMyGenomeButton").removeClass("hide");
        $(".popover-content #myGenomeProgress").addClass("hide");

        // hide the popover
        if ($popover && !$popover.hasClass("hide") && $popover.find(".invalid-file").size() === 0) {
            $myGenomesButton.click();
        }
    }

    function showInvalidFileFormat(filename) {
        if ($popover) {
            $popover.find("#myGenomeProgress").before("<div class='alert alert-danger invalid-file'>The file <b>" + filename + "</b> doesn't seem to be a valid FASTA file.</div>");
        }
    }

    /**
     * Sends a request to the webworker to process the content of a file
     * Returns a promise containing the list of peptides.
     */
    function processFileContent(file, name, id) {
        return new Promise(function (resolve, reject) {
            sendToWorker("processFile", {
                file: file,
                name: name,
                id: id,
            });
            promisesProcess.set(id, function (data) {
                if (data.status === "ok") {
                    resolve(data);
                } else {
                    reject("Invalid file format");
                }
            });
        }).then(function (peptides) {
            showNotification("Proteome " + name + " added");
            addGenome(peptides.id, peptides.name, version, peptides.ids, file);
        }).catch(function (message) {
            showInvalidFileFormat(name);
        });
    }

    /**
     * Processes the converted genome
     *
     * @param <Array> ids A sorted array with integer id's
     * @param <String> name The name of the genome
     * @param <String> id The id of the genome
     */
    function processConvertedGenome(data) {
        if (promisesProcess.has(data.id)) {
            promisesProcess.get(data.id).call(this, data);
            promisesProcess.delete(data.id);
        }
    }

    /**
     * Updates the progress bar with a new value
     *
     * @param <Number> percentage The new width in %
     */
    function processProgress(percentage) {
        requestAnimationFrame(function () {
            $(".popover-content #myGenomeProgress .progress-bar").css("width", (percentage * 100) + "%");
        });
    }

    /**
     * Add a genome to the list of myGenomes in local storage
     *
     * @param <String> id A random id
     * @param <String> name The genome name
     * @param <String version The uniprot version
     * @param <Array> ids A list of ints
     * @param <String> file The content of the original file
     */
    function addGenome(id, name, version, ids, file) {
        if (genomeList.indexOf(id) === -1) {
            // add
            genomeList.push(id);
            genomes[id] = {id: id, name: name, version: version};

            dataStore.addGenome({id: id, name: name, version: version, peptides: ids, file: file});
        } else {
            // update
            genomes[id].version = version;
            dataStore.addGenome({id: id, name: name, version: version, peptides: ids});
        }

        // update the list
        redrawTable();
    }

    /**
     * Removes a genome from the my genome list
     *
     * @param <String> id The id to remove
     */
    function removeGenome(id) {
        // update local list
        genomeList.splice(genomeList.indexOf(id), 1);
        delete genomes[id];

        dataStore.removeGenome(id);

        // update the list
        redrawTable();
    }

    /**
     * Changes the genome name
     *
     * @param <String> id The id of the genome
     * @param <String> name The new name of the genome
     */
    function editGenomeName(id, name) {
        genomes[id].name = name;
        dataStore.updateGenome(genomes[id]);
    }

    /**
     * removes all the genomes from the my genome list
     */
    function removeAllGenomes() {
        if (confirm("Are you sure you want to remove all your proteomes?")) {
            let i,
                id;

            for (i = genomeList.length - 1; i >= 0; i--) {
                id = genomeList[i];
                genomeList.splice(i, 1);
                delete genomes[id];
                dataStore.removeGenome(id);
            }

            // update the list
            redrawTable();
        }
    }

    /**
     * Add all my genomes to the analysis
     */
    function addAllGenomes() {
        let toAdd = [];
        let i;
        for (i = 0; i < genomeList.length; i++) {
            toAdd.push({
                id: genomeList[i],
                name: genomes[genomeList[i]].name,
            });
        }
        pancore.addGenomes(toAdd);
    }

    /**
     * Redraws the table with all added genomes
     */
    function redrawTable() {
        let i,
            g,
            row,
            name,
            isCurrent;

        $myGenomesTable.empty();
        if (genomeList.length === 0) {
            $myGenomesTable.append("<tr class='success'><td colspan='4' class='success'><span class='glyphicon glyphicon-question-sign'></span> Click the add your own proteomes button to add proteomes.</td></tr>");
        } else {
            for (i = 0; i < genomeList.length; i++) {
                g = genomes[genomeList[i]];
                isCurrent = g.version === version;
                row = "<tr class='own' data-genomeid='" + g.id + "'>";
                row += "<td class='button'><button class='btn btn-default btn-xs remove-my-genome' title='remove proteome'";
                row += isCurrent ? "" : " disabled ";
                row += "><span class='glyphicon glyphicon-trash'></span></button></td>";
                row += "<td class='name'>" + g.name + "</td>";
                if (isCurrent) {
                    row += "<td><button class='btn btn-default btn-xs edit-genome-name' title='edit proteome name'><span class='glyphicon glyphicon-pencil'></span></button></td>";
                } else {
                    row += "<td><span class='glyphicon glyphicon-refresh'></span></td>";
                }
                row += "<td><button class='btn btn-default btn-xs btn-add' title='add proteome to analysis'";
                row += isCurrent ? "" : " disabled ";
                row += "><span class='glyphicon glyphicon-plus'></span></button></td>";
                row += "</tr>";
                $myGenomesTable.append(row);
            }
            $myGenomesTable.find(".btn-add").click(function () {
                let $row = $(this).closest("tr");
                let id = $row.data("genomeid");
                let name = $row.find(".name").text();
                pancore.addGenomes([{
                    id: id,
                    name: name,
                }]);
            });
            $(".remove-my-genome").click(function () {
                removeGenome($(this).parents("tr").data("genomeid"));
            });
            $(".edit-genome-name").click(function () {
                let $row = $(this).parents("tr");
                if ($row.hasClass("edit")) {
                    name = $row.find(".name input").val();
                    $row.find(".name").html(name);
                    $(this).find(".glyphicon").removeClass("glyphicon-ok").addClass("glyphicon-pencil");
                    $row.removeClass("edit");
                    editGenomeName($row.data("genomeid"), name);
                } else {
                    name = $row.find(".name").text();
                    $row.find(".name").html("<input type='text' class='form-control input-xs'></input>");
                    $(this).find(".glyphicon").removeClass("glyphicon-pencil").addClass("glyphicon-ok");
                    $row.find(".name input").focus().val(name);
                    $row.addClass("edit");
                }
            });
        }

        $("#my-genomes-tab .badge").text(genomeList.length);
    }

    /**
     * Reads a given file and returns its content as a Promise
     */
    function readFile(file) {
        return new Promise(function (resolve, reject) {
            let reader = new FileReader();
            reader.onload = function (e) {
                resolve(reader.result);
            };
            reader.readAsText(file);
        });
    }

    /** ************* indexedDBStore methods ************/

    /**
     * Initializes the database
     */
    indexedDBStore.init = function init() {
        let version = 4;
        let request = indexedDB.open("myGenomes", version);
        return new Promise(function (resolve, reject) {
            request.onupgradeneeded = function (e) {
                let db = e.target.result;

                e.target.transaction.onerror = indexedDBStore.onerror;

                if (db.objectStoreNames.contains("metadata")) {
                    db.deleteObjectStore("metadata");
                }
                if (db.objectStoreNames.contains("peptideLists")) {
                    db.deleteObjectStore("peptideLists");
                }
                if (db.objectStoreNames.contains("files")) {
                    db.deleteObjectStore("files");
                }

                db.createObjectStore("metadata", {keyPath: "id"});
                db.createObjectStore("peptideLists", {keyPath: "id"});
                db.createObjectStore("files", {keyPath: "id"});
            };

            request.onsuccess = function (e) {
                indexedDBStore.db = e.target.result;
                resolve(indexedDBStore.loadMyGenomes());
            };

            request.onerror = indexedDBStore.onerror;
        });
    };

    /**
     * Retrieves the list of genomes from the store and updates the UI
     */
    indexedDBStore.loadMyGenomes = function loadMyGenomes() {
        let db = indexedDBStore.db;
        let trans = db.transaction(["metadata", "files"], "readwrite");
        let store = trans.objectStore("metadata");
        let files = trans.objectStore("files");
        let fileRequest;
        let dataQueue = [];
        let $notification;
        return new Promise(function (resolve, reject) {
            // Get everything in the store;
            let keyRange = IDBKeyRange.lowerBound(0);
            let cursorRequest = store.openCursor(keyRange);

            cursorRequest.onsuccess = function (e) {
                let result = e.target.result;
                // are we done yet?
                if (!!result == false) {
                    resolve();
                    return;
                }

                genomeList.push(result.value.id);
                genomes[result.value.id] = result.value;

                // process if done
                if (result.value.version !== version) {
                    if (!$notification) {
                        $notification = showNotification("Updating my proteomes...", {
                            loading: true,
                            autoHide: false,
                        });
                    }
                    fileRequest = files.get(result.value.id);
                    fileRequest.onsuccess = function (e) {
                        if (e.target.result) {
                            dataQueue.push({file: e.target.result.file, name: result.value.name, id: result.value.id});
                        } else {
                            removeGenome(result.value.id);
                        }
                    };
                    fileRequest.onerror = indexedDBStore.onerror;
                }
                result.continue();
            };
            cursorRequest.onerror = indexedDBStore.onerror;
        }).then(function () {
            genomesResolver(genomes);
            redrawTable();
            return dataQueue.reduce(function (promise, data) {
                return promise.then(function () {
                    return processFileContent(data.file, data.name, data.id);
                });
            }, Promise.resolve())
                .then(function () {
                    if ($notification) {
                        $notification.hide();
                    }
                });
        });
    };

    /**
     * Adds a genome to the data store
     *
     * @param <Genome> genome The genome to be added
     */
    indexedDBStore.addGenome = function addGenome(genome) {
        let genomePeptides = {id: genome.id, peptides: genome.peptides};
        let genomeFile = genome.file ? {id: genome.id, file: genome.file} : null;
        let genomeMetadata = genome;
        delete genomeMetadata.peptides;
        delete genomeMetadata.file;

        let db = indexedDBStore.db;
        let trans = db.transaction(["metadata", "peptideLists", "files"], "readwrite");
        let metadata = trans.objectStore("metadata");
        let peptideLists = trans.objectStore("peptideLists");
        let files = trans.objectStore("files");

        let metadataRequest = metadata.put(genomeMetadata);
        metadataRequest.onerror = indexedDBStore.onerror;

        let peptideListRequest = peptideLists.put(genomePeptides);
        peptideListRequest.onerror = indexedDBStore.onerror;

        if (genomeFile) {
            let fileRequest = files.put(genomeFile);
            fileRequest.onerror = indexedDBStore.onerror;
        }
    };

    /**
     * Removes a genome from the indexedDBStore
     *
     * @param <String> id The id of the genome to remove
     */
    indexedDBStore.removeGenome = function removeGenome(id) {
        let db = indexedDBStore.db;
        let trans = db.transaction(["metadata", "peptideLists", "files"], "readwrite");
        let metadata = trans.objectStore("metadata");
        let peptideLists = trans.objectStore("peptideLists");
        let files = trans.objectStore("files");

        let metadataRequest = metadata.delete(id);
        metadataRequest.onerror = indexedDBStore.onerror;

        let peptideListRequest = peptideLists.delete(id);
        peptideListRequest.onerror = indexedDBStore.onerror;

        let filesRequest = files.delete(id);
        filesRequest.onerror = indexedDBStore.onerror;
    };

    /**
     * Updates a genome in the data store
     *
     * @param <Genome> genome The genome to update
     */
    indexedDBStore.updateGenome = function updateGenome(genome) {
        let db = indexedDBStore.db;
        let trans = db.transaction(["metadata"], "readwrite");
        let metadata = trans.objectStore("metadata");

        let metadataRequest = metadata.put(genome);
        metadataRequest.onerror = indexedDBStore.onerror;
    };

    /**
     * Fetches a list of peptides for a given genome and returns it as a promise
     *
     * @param <String> id The id of the genome
     */
    indexedDBStore.getPeptideList = function getPeptideList(id) {
        return new Promise(function (resolve, reject) {
            let db = indexedDBStore.db;
            let trans = db.transaction(["metadata", "peptideLists"], "readwrite");
            let peptideLists = trans.objectStore("peptideLists");

            let peptideListRequest = peptideLists.get(id);
            peptideListRequest.onsuccess = function (e) {
                resolve(e.target.result.peptides);
            };
            peptideListRequest.onerror = indexedDBStore.onerror;
        });
    };

    /**
     * Handles an indexedDB error
     */
    indexedDBStore.onerror = function onerror(e) {
        /* eslint-disable no-console */
        console.log(e);
        /* eslint-enable no-console */
    };

    /** ************* localstorage methods ************/

    /**
     * Initializes the database
     */
    localStorageStore.init = function init() {
        return localStorageStore.loadMyGenomes();
    };

    /**
     * Retrieves the list of genomes from the store and updates the UI
     */
    localStorageStore.loadMyGenomes = function loadMyGenomes() {
        let i,
            id;

        genomes = localStorage.genomes ? JSON.parse(localStorage.genomes) : {};
        genomeList = localStorage.genomeList ? JSON.parse(localStorage.genomeList) : [];

        // remove old genomes
        for (i = genomeList.length - 1; i >= 0; i--) {
            id = genomeList[i];
            if (genomes[id].version !== version) {
                genomeList.splice(i, 1);
                delete genomes[id];
                localStorageStore.removeGenome(id);
            }
        }

        genomesResolver(genomes);
        redrawTable();
        return Promise.resolve();
    };

    /**
     * Adds a genome to the data store
     *
     * @param <Genome> genome The genome to be added
     */
    localStorageStore.addGenome = function addGenome(genome) {
        localStorage.genomeList = JSON.stringify(genomeList);
        localStorage.genomes = JSON.stringify(genomes);
        localStorage["genome_" + genome.id] = JSON.stringify(genome.peptides);
    };

    /**
     * Removes a genome from the data store
     *
     * @param <String> id The id of the genome to remove
     */
    localStorageStore.removeGenome = function removeGenome(id) {
        localStorage.genomeList = JSON.stringify(genomeList);
        localStorage.genomes = JSON.stringify(genomes);
        delete localStorage["genome_" + id];
    };

    /**
     * Updates a genome in the data store
     *
     * @param <Genome> genome The genome to update
     */
    localStorageStore.updateGenome = function updateGenome(genome) {
        localStorage.genomeList = JSON.stringify(genomeList);
        localStorage.genomes = JSON.stringify(genomes);
    };

    /**
     * Fetches a list of peptides for a given genome and returns it as a promise
     *
     * @param <String> id The id of the genome
     */
    localStorageStore.getPeptideList = function getPeptideList(id) {
        let ids = JSON.parse(localStorage["genome_" + id]);
        return Promise.resolve(ids);
    };

    /** ************* Public methods ***************/

    /**
     * Retrieves the list of peptide ids from the datastore and returns it as
     * a promise.
     *
     * @param <String> id The id of the genome
     */
    that.getIds = function getIds(id) {
        return dataStore.getPeptideList(id);
    };

    /**
     * Retrieves a genome object for a given id
     */
    that.getGenome = function getGenome(id) {
        return genomes[id];
    };

    /**
     * Retrieves a genomes promise
     */
    that.getGenomes = function getGenomes() {
        return genomesPromise;
    };

    // initialize the object
    init();

    return that;
}

export {constructMyGenomes};
