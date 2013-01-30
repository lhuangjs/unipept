package xml;

import java.sql.Timestamp;
import java.util.HashMap;
import java.util.Map;

import org.xml.sax.Attributes;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

import storage.PeptideLoaderData;

public class UniprotHandler extends DefaultHandler {

	private final boolean isSwissprot;
	private final PeptideLoaderData pld;

	private UniprotEntry currentItem;
	private UniprotDbRef dbRef;
	private StringBuilder charData;
	private int i;
	private boolean inOrganism = false;

	private Map<String, EndTagWorker> endTagWorkers;
	private Map<String, StartTagWorker> startTagWorkers;

	public UniprotHandler(boolean isSwissprot, PeptideLoaderData peptideLoaderData) {
		super();
		this.isSwissprot = isSwissprot;
		this.pld = peptideLoaderData;
		charData = new StringBuilder();
		i = 0;

		// set up end tag workers
		endTagWorkers = new HashMap<String, EndTagWorker>();
		endTagWorkers.put("entry", new EndTagWorker() {
			@Override
			public void handleTag(String data) {
				pld.store(currentItem);
				i++;
				if (i % 100000 == 0)
					System.out.println(new Timestamp(System.currentTimeMillis()) + " Entry " + i
							+ " added");
			}
		});
		endTagWorkers.put("accession", new EndTagWorker() {
			@Override
			public void handleTag(String data) {
				currentItem.setUniprotAccessionNumber(data);
			}
		});
		endTagWorkers.put("organism", new EndTagWorker() {
			@Override
			public void handleTag(String data) {
				inOrganism = false;
			}
		});
		endTagWorkers.put("sequence", new EndTagWorker() {
			@Override
			public void handleTag(String data) {
				currentItem.setSequence(data);
			}
		});
		endTagWorkers.put("dbReference", new EndTagWorker() {
			@Override
			public void handleTag(String data) {
				if (!inOrganism && dbRef != null) {
					currentItem.addDbRef(dbRef);
					dbRef = null;
				}
			}
		});

		// set up start tag workers
		startTagWorkers = new HashMap<String, StartTagWorker>();
		startTagWorkers.put("entry", new StartTagWorker() {
			@Override
			public void handleTag(Attributes atts) {
				newCurrentItem();
				currentItem.setVersion(Integer.valueOf(atts.getValue("version")));
			}
		});
		startTagWorkers.put("organism", new StartTagWorker() {
			@Override
			public void handleTag(Attributes atts) {
				inOrganism = true;
			}
		});
		startTagWorkers.put("dbReference", new StartTagWorker() {
			@Override
			public void handleTag(Attributes atts) {
				if (inOrganism) {
					if (atts.getValue("type").equals("NCBI Taxonomy"))
						currentItem.setTaxonId(Integer.valueOf(atts.getValue("id")));
				}
				if (atts.getValue("type").equals("EMBL")) {
					dbRef = new UniprotDbRef("EMBL");
					dbRef.setSequenceId(atts.getValue("id"));
				}
				if (atts.getValue("type").equals("RefSeq")) {
					dbRef = new UniprotDbRef("RefSeq");
					dbRef.setProteinId(atts.getValue("id"));
				}
			}
		});
		startTagWorkers.put("property", new StartTagWorker() {
			@Override
			public void handleTag(Attributes atts) {
				if (dbRef != null) {
					if (atts.getValue("type").equals("protein sequence ID"))
						dbRef.setProteinId(atts.getValue("value"));
					if (atts.getValue("type").equals("nucleotide sequence ID"))
						dbRef.setSequenceId(atts.getValue("value"));
				}
			}
		});
	}

	@Override
	public void startElement(String namespaceURI, String localName, String qName, Attributes atts) {
		StartTagWorker worker = startTagWorkers.get(qName);
		if (worker != null) {
			worker.handleTag(atts);
		}
	}

	@Override
	public void endElement(String uri, String localName, String qName) throws SAXException {
		EndTagWorker worker = endTagWorkers.get(qName);
		if (worker != null) {
			worker.handleTag(charData.toString().trim());
		}
		charData.delete(0, charData.length());
	}

	@Override
	public void characters(char[] ch, int start, int length) throws SAXException {
		charData.append(ch, start, length);
	}

	private void newCurrentItem() {
		currentItem = new UniprotEntry(isSwissprot);
	}

	private interface StartTagWorker {
		void handleTag(Attributes att);
	}

	private interface EndTagWorker {
		void handleTag(String data);
	}
}