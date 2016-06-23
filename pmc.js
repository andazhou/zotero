{
	"translatorID": "18ab6c17-febb-4f20-8add-5e805204bfd5",
	"label": "PubMed (PMC)",
	"creator": "Anda Zhou",
	"target": "^https?://(www\\.)?ncbi\\.nlm\\.nih\\.gov/pmc",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "g",
	"lastUpdated": "2016-06-23 13:34:13"
}

function detectWeb(doc, url) {
	if (getPMCID(url)) {
		return "journalArticle";
	}
	
	if(getSearchResults(doc, true)) {
		return "multiple";
	}
}

function doWeb(doc, url) {
	if (detectWeb(doc, url) == "multiple") {
		var results = getSearchResults(doc);
		Zotero.selectItems(results.ids, function (ids) {
			if (!ids) {
				return true;
			}

			var pmcids = new Array();
			for (var i in ids) {
				
				pmcids.push(i);
			}
			
			lookupPMCIDs(pmcids, doc, results.pdfs);
		});
		
	} else {

		var pmcid = getPMCID(url);
		var pdf = getPDF(doc,'//td[@class="format-menu"]//a[contains(@href,".pdf")]'
				+ '|//div[@class="format-menu"]//a[contains(@href,".pdf")]'
				+ '|//aside[@id="jr-alt-p"]/div/a[contains(@href,".pdf")]');
		var pdfCollection = {};
				
		if(pdf) pdfCollection[pmcid] = pdf;
		
		var refResults = getRefs(doc);
		Zotero.debug(refResults)
		
		Zotero.selectItems(refResults.ids, function (ids) {
			if (!ids) {
				return true;
			}
			
			var pmcids = new Array();
			for (var i in ids) {
				pmcids.push(i);
				
			}
			lookupPMCIDs(pmcids, doc, refResults.pdfs);
		});
		//lookupPMCIDs([pmcid], doc, pdfCollection);
	}
}

function getPMCID(url) {
	var pmcid = url.match(/\/articles\/PMC([\d]+)/);
	return pmcid ? pmcid[1] : false;
}


function getPDF(doc,xpath) {
	var pdf = ZU.xpath(doc,xpath);
	return pdf.length ? pdf[0].href : false;
}

function getSearchResults(doc, checkOnly) {
	var articles = doc.getElementsByClassName('rprt'),
		ids = {},
		pdfCollection = {},
		found = false;
	for (var i = 0; i < articles.length; i++) {
		var article = articles[i],
			pmcid = ZU.xpathText(article,'.//dl[@class="rprtid"]/dd');
		if (pmcid) pmcid = pmcid.match(/PMC([\d]+)/);
		if (pmcid) {
			if (checkOnly) return true;
			
			var title = ZU.xpathText(article,'.//div[@class="title"]');
			var pdf = getPDF(article,'.//div[@class="links"]/a'
				+'[@class="view" and contains(@href,".pdf")][1]');

			ids[pmcid[1]] = title;
			
			found = true;
			
			if(pdf) pdfCollection[pmcid[1]] = pdf;
		}
	}
	return found ? {"ids":ids,"pdfs":pdfCollection} : false;
}

function lookupPMCIDs(ids, doc, pdfLink) {
	var newUri = "//eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&retmode=xml&id="
		+ encodeURIComponent(ids.join(","));
	//Zotero.debug(newUri);
	ZU.doGet(newUri, function (text) {
		text = text.replace(/(<[^!>][^>]*>)/g, function(str, p1, p2, offset, s) {
			return str.replace(/[-:]/gm, "");
		}); //Strip hyphens and colons from element names, attribute names and attribute values
		
		text = text.replace(/<xref[^<\/]*<\/xref>/g, ""); //Strip xref cross reference from e.g. title
		//Z.debug(text)
		
		var parser = new DOMParser();
		var doc = parser.parseFromString(text, "text/xml");

		var articles = ZU.xpath(doc, '/pmcarticleset/article');

		for(var i in articles) {
			var newItem = new Zotero.Item("journalArticle");
			
			var journal = ZU.xpath(articles[i], 'front/journalmeta');

			newItem.journalAbbreviation = ZU.xpathText(journal, 'journalid[@journalidtype="nlmta"]');
			
			var journalTitle;
			if ((journalTitle = ZU.xpathText(journal, 'journaltitlegroup/journaltitle'))) {
				newItem.publicationTitle = journalTitle;
			} else if ((journalTitle = ZU.xpathText(journal, 'journaltitle'))) {
				newItem.publicationTitle = journalTitle;
			}

			var issn;
			if ((issn = ZU.xpathText(journal, 'issn[@pubtype="ppub"]'))) {
				newItem.ISSN = issn;
			} else if ((issn = ZU.xpathText(journal, 'issn[@pubtype="epub"]'))) {
				newItem.ISSN = issn;
			}

			var article = ZU.xpath(articles[i], 'front/articlemeta');

			var abstract;
			if ((abstract = ZU.xpathText(article, 'abstract/p'))) {
				newItem.abstractNote = abstract;
			} else {
				var abstractSections = ZU.xpath(article, 'abstract/sec');
				var abstract = [];
				for (var j in abstractSections) {
					abstract.push(ZU.xpathText(abstractSections[j], 'title') + "\n" + ZU.xpathText(abstractSections[j], 'p'));
				}
				newItem.abstractNote = abstract.join("\n\n");
			}

			newItem.DOI = ZU.xpathText(article, 'articleid[@pubidtype="doi"]');
			
			newItem.extra = "PMID: " + ZU.xpathText(article, 'articleid[@pubidtype="pmid"]') + "\n";
			newItem.extra = newItem.extra + "PMCID: PMC" + ids[i];

			newItem.title = ZU.trim(ZU.xpathText(article, 'titlegroup/articletitle'));
			
			newItem.volume = ZU.xpathText(article, 'volume');
			newItem.issue = ZU.xpathText(article, 'issue');

			var lastPage = ZU.xpathText(article, 'lpage');
			var firstPage = ZU.xpathText(article, 'fpage');
			if (firstPage && lastPage && (firstPage != lastPage)) {
				newItem.pages = firstPage + "-" + lastPage;
			} else if (firstPage) {
				newItem.pages = firstPage;
			}

			var pubDate = ZU.xpath(article, 'pubdate[@pubtype="ppub"]');
			if (!pubDate.length) {
				pubDate = ZU.xpath(article, 'pubdate[@pubtype="epub"]');
			}
			if (pubDate) {
				if (ZU.xpathText(pubDate, 'day')) {
					newItem.date = ZU.xpathText(pubDate, 'year') + "-" + ZU.xpathText(pubDate, 'month') + "-" + ZU.xpathText(pubDate, 'day');
				} else if (ZU.xpathText(pubDate, 'month')) {
					newItem.date = ZU.xpathText(pubDate, 'year') + "-" + ZU.xpathText(pubDate, 'month');
				} else if (ZU.xpathText(pubDate, 'year')) {
					newItem.date = ZU.xpathText(pubDate, 'year');
				}
			}

			var contributors = ZU.xpath(article, 'contribgroup/contrib');
			if (contributors) {
				var authors = ZU.xpath(article, 'contribgroup/contrib[@contribtype="author"]');
				for (var j in authors) {
					var lastName = ZU.xpathText(authors[j], 'name/surname');
					var firstName = ZU.xpathText(authors[j], 'name/givennames');
					if (firstName || lastName) {
						newItem.creators.push({
							lastName: lastName,
							firstName: firstName
						});
					}
				}
			}

			var linkurl = "http://www.ncbi.nlm.nih.gov/pmc/articles/PMC" + ids[i] + "/";
			newItem.url = linkurl;
			newItem.attachments = [{
				url: linkurl,
				title: "PubMed Central Link",
				mimeType: "text/html",
				snapshot: false
			}];
			
			if (pdfLink) {
				var pdfFileName = pdfLink[ids[i]];
			} else if (ZU.xpathText(article, 'selfuri/@xlinktitle') == "pdf") {
				var pdfFileName = "http://www.ncbi.nlm.nih.gov/pmc/articles/PMC" + 
				ids[i] + "/pdf/" + ZU.xpathText(article, 'selfuri/@xlinkhref');
			} else if (ZU.xpathText(article, 'articleid[@pubidtype="publisherid"]')){
				//this should work on most multiples
				var pdfFileName = "http://www.ncbi.nlm.nih.gov/pmc/articles/PMC" + 
				ids[i] + "/pdf/" + ZU.xpathText(article, 'articleid[@pubidtype="publisherid"]') + ".pdf";
			}
			
			if (pdfFileName) {
				newItem.attachments.push({
				title:"PubMed Central Full Text PDF",
				mimeType:"application/pdf",
				url:pdfFileName
				});
			}

			newItem.complete();
		}
	});
}

function getRefs(doc) {
	
	var references = doc.getElementsByClassName('element-citation');
	var ids = {};
	var refs = new Array();
	var pdfCollection = {};
	var found = false;
	for (var i = 0; i < references.length; i++) {
		var reference = references[i];
		var pubid = ZU.xpathText(reference, './/span/a[text()="PubMed"]/@href');
		var pmcid = ZU.xpathText(reference, './/span/a[text()="PMC free article"]/@href');

		if (pmcid) {

			pmcid = getPMCID(pmcid);
			var clickURL = "http://ncbi.nlm.nih.gov/pmc/articles/PMC" + pmcid + "/pdf/";
			var pdf = clickURL;
			var title = ZU.xpathText(reference, './/text()');
			title = title.split(".");
			
			ids[pmcid] = title[1];
			found = true;
			if(pdf) pdfCollection[pmcid] = pdf;
		}

	}
	
	

	Zotero.debug("There are " + references.length + " references on this article");

	
	return found ? {"ids":ids,"pdfs":pdfCollection} : false;
}


