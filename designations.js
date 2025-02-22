class Designation{
    constructor(value,tick,sub){
        this.num = undefined;
        if(value instanceof Array){
            let n;
            if(value.length>2){
                n = value[1];
                value[1] = zeroPad(n,2);
            }else{
                n = value[0];
                value[0] = zeroPad(n,2);
            }
            this.value = value.join('');
            if(typeof n === 'number') this.num = n;
        }else this.value = value;
        this.effectiveTicks = [tick];
        this.hideTicks = [];
        this.subBasin = sub || 0;
        if(this.value instanceof LoadData) this.load(this.value);
    }

    isName(){
        if(this.num===undefined) return true;
    }

    truncate(){
        if(this.isName()){
            return ({
                'Alpha':'\u03B1',
                'Beta':'\u03B2',
                'Gamma':'\u03B3',
                'Delta':'\u03B4',
                'Epsilon':'\u03B5',
                'Zeta':'\u03B6',
                'Eta':'\u03B7',
                'Theta':'\u03B8',
                'Iota':'\u03B9',
                'Kappa':'\u03BA',
                'Lambda':'\u03BB',
                'Mu':'\u03BC',
                'Nu':'\u03BD',
                'Xi':'\u03BE',
                'Omicron':'\u03BF',
                'Pi':'\u03C0',
                'Rho':'\u03C1',
                'Sigma':'\u03C3',
                'Tau':'\u03C4',
                'Upsilon':'\u03C5',
                'Phi':'\u03C6',
                'Chi':'\u03C7',
                'Psi':'\u03C8',
                'Omega':'\u03C9'
            })[this.value] || this.value.slice(0,1);
        }else return this.num + '';
    }
    
    activeAt(t){
        let e;
        let h;
        for(let i=0;i<this.effectiveTicks.length;i++){
            let n = this.effectiveTicks[i];
            if(t>=n && (!e || n>e)) e = n;
        }
        for(let i=0;i<this.hideTicks.length;i++){
            let n = this.hideTicks[i];
            if(t>=n && (!h || n>h)) h = n;
        }
        if(e && (!h || e>h)) return e;
        return false;
    }

    hide(t){
        if(typeof t === 'number') this.hideTicks.push(t);
    }

    show(t){
        if(typeof t === 'number') this.effectiveTicks.push(t);
    }

    save(){
        let o = {};
        for(let p of [
            'value',
            'num',
            'effectiveTicks',
            'hideTicks',
            'subBasin'
        ]) o[p] = this[p];
        return o;
    }

    load(data){
        if(data instanceof LoadData){
            let o = data.value;
            for(let p of [
                'value',
                'num',
                'subBasin'
            ]) this[p] = o[p];
            for(let p of [
                'effectiveTicks',
                'hideTicks'
            ]) if(o[p]) this[p] = o[p];
            if(o.effectiveTick) this.effectiveTicks.push(o.effectiveTick);
        }
    }
}

class DesignationSystem{
    constructor(data){
        let opts;
        if(data && !(data instanceof LoadData)) opts = data;
        else opts = {};
        this.subBasin = undefined;
        this.displayName = opts.displayName;
        // if designations should be secondary instead of primary
        this.secondary = opts.secondary;
        this.numbering = {};
        // set to false to disable numbering (prefixes and suffixes may still be used for numbered designations from a parent sub-basin)
        this.numbering.enabled = opts.numEnable===undefined ? true : opts.numEnable;
        // a prefix for numbered designations (e.g. "BOB" and "ARB")
        this.numbering.prefix = undefined;
        if(opts.prefix!==undefined) this.numbering.prefix = opts.prefix;
        else if(this.numbering.enabled) this.numbering.prefix = '';
        // a suffix for numbered designations (e.g. "L" and "E")
        this.numbering.suffix = undefined;
        if(opts.suffix!==undefined) this.numbering.suffix = opts.suffix;
        else if(this.numbering.enabled){
            if(opts.prefix!==undefined) this.numbering.suffix = '';
            else this.numbering.suffix = DEPRESSION_LETTER;
        }
        // scale category threshold for numbering a system (overrides Scale.numberingThreshold)
        this.numbering.threshold = opts.numThresh;
        // behavior for primary designations of basin-crossing systems [may need more testing]
        // 0 = always redesignate (use previous designation from this sub-basin if exists)
        // 1 = strictly redesignate (use new designation even if a previous one from this sub-basin exists)
        // 2 = redesignate regenerating systmes (keep designations of systems that retain TC status through the crossing; use previous designation if applicable)
        // 3 = strictly redesignate regenerating systems (always use new designation for regenerating systems even if previous one exists)
        // 4 = never redesignate (keep designations regardless of retaining TC status)
        this.numbering.crossingMode = opts.numCross===undefined ? DESIG_CROSSMODE_ALWAYS : opts.numCross;
        this.naming = {};
        // main name lists to be used
        this.naming.mainLists = [];
        if(opts.mainLists instanceof Array) this.naming.mainLists = opts.mainLists;
        // auxiliary lists to be used if the main list for a year is exhausted (only applicable to annual naming)
        this.naming.auxiliaryLists = [];
        if(opts.auxLists instanceof Array) this.naming.auxiliaryLists = opts.auxLists;
        // lists to be used for automatic replacement of names on other lists [To Be Implemented]
        this.naming.replacementLists = [];
        if(opts.repLists instanceof Array) this.naming.replacementLists = opts.repLists;
        // whether naming should be annual (Atl/EPac/SWIO/PAGASA) or continuous (WPac/CPac/Aus/etc.)
        this.naming.annual = opts.annual;
        // the year to anchor the cycle of annual lists to (this year will use the #0 (first) name list)
        this.naming.annualAnchorYear = opts.anchor===undefined ? 1979 : opts.anchor;
        // counter for continuous name assignment (only applicable to continuous naming)
        this.naming.continuousNameIndex = opts.indexOffset || 0;
        // scale category threshold for naming a system (overrides Scale.namingThreshold)
        this.naming.threshold = opts.nameThresh;
        // behavior for primary designations of basin-crossing systems (see above)
        this.naming.crossingMode = opts.nameCross===undefined ? DESIG_CROSSMODE_STRICT_REGEN : opts.nameCross;
        if(data instanceof LoadData) this.load(data);
    }

    setSubBasin(sb){
        if(sb instanceof SubBasin) this.subBasin = sb;
    }

    addMainLists(...lists){
        for(let l of lists){
            if(l instanceof Array){
                this.naming.mainLists.push(l);
            }
        }
        return this;
    }

    addAuxiliaryLists(...lists){
        for(let l of lists){
            if(l instanceof Array){
                this.naming.auxiliaryLists.push(l);
            }
        }
        return this;
    }

    addReplacementLists(...lists){
        for(let l of lists){
            if(l instanceof Array){
                this.naming.replacementLists.push(l);
            }
        }
        return this;
    }

    setSecondary(v){
        this.secondary = !!v;
        return this;
    }

    setCrossingModes(numCM,nameCM){
        if(numCM !== undefined) this.numbering.crossingMode = numCM;
        if(nameCM !== undefined) this.naming.crossingMode = nameCM;
        return this;
    }

    setThresholds(numThresh,nameThresh){
        if(numThresh !== undefined) this.numbering.threshold = numThresh;
        if(nameThresh !== undefined) this.naming.threshold = nameThresh;
        return this;
    }

    setContinuousNameIndex(i){
        if(i !== undefined) this.naming.continuousNameIndex = i;
        return this;
    }

    getName(tick,year,index){
        if(this.naming.mainLists.length<1) return undefined;
        if(tick===undefined && this.subBasin) tick = this.subBasin.basin.tick;
        let name;
        if(this.naming.annual){
            if(year===undefined && this.subBasin) year = this.subBasin.basin.getSeason(tick);
            let y = year - this.naming.annualAnchorYear;
            let m = this.naming.mainLists;
            let numOfLists = m.length;
            let i = (y%numOfLists+numOfLists)%numOfLists;
            let l = m[i];
            if(index===undefined) index = 0;
            if(index>=l.length){
                index -= l.length;
                m = this.naming.auxiliaryLists;
                i = 0;
                let sum = 0;
                while(i<m.length && index-sum >= m[i].length){
                    sum += m[i].length;
                    i++;
                }
                if(i>=m.length) return undefined;
                index -= sum;
                name = m[i][index];
            }else name = l[index];
        }else{
            if(index===undefined) index = 0;
            let m = this.naming.mainLists;
            let i = 0;
            let sum = 0;
            while(i<m.length && index-sum >= m[i].length){
                sum += m[i].length;
                i++;
            }
            if(i>=m.length){
                index = 0;
                i = 0;
            }else index -= sum;
            name = m[i][index];
        }
        return new Designation(name,tick,this.subBasin ? this.subBasin.id : 0);
    }

    getNewName(){
        if(this.subBasin){
            let sb = this.subBasin;
            let basin = sb.basin;
            let t = basin.tick;
            let y = basin.getSeason(t);
            let season = basin.fetchSeason(y,false,true);
            let i;
            if(this.naming.annual) i = season.stats(sb.id).designationCounters.name++;
            else{
                i = this.naming.continuousNameIndex++;
                let totalLength = 0;
                for(let l of this.naming.mainLists) totalLength += l.length;
                if(this.naming.continuousNameIndex>=totalLength) this.naming.continuousNameIndex = 0;
            }
            return this.getName(t,y,i);
        }
        return undefined;
    }

    getNum(tick,index,altPre,altSuf){
        let pre = this.numbering.prefix;
        let suf = this.numbering.suffix;
        if(altPre!==undefined) pre = altPre;
        if(altSuf!==undefined) suf = altSuf;
        let num = [pre,index,suf];
        return new Designation(num,tick,this.subBasin ? this.subBasin.id : 0);
    }

    getNewNum(altPre,altSuf){
        if(this.subBasin){
            let sb = this.subBasin;
            let basin = sb.basin;
            let t = basin.tick;
            let season = basin.fetchSeason(t,true,true);
            let i = ++season.stats(sb.id).designationCounters.number; // prefix increment because numbering starts at 01
            let numDesig = this.getNum(t,i,altPre,altSuf);
            return numDesig;
        }
        return undefined;
    }

    clone(){
        let newDS = new DesignationSystem();
        newDS.secondary = this.secondary;
        newDS.displayName = this.displayName;
        let numg = this.numbering;
        let namg = this.naming;
        let Numg = newDS.numbering;
        let Namg = newDS.naming;
        for(let p of [
            'enabled',
            'prefix',
            'suffix',
            'threshold',
            'crossingMode'
        ]) Numg[p] = numg[p];
        for(let p of [
            'annual',
            'annualAnchorYear',
            'continuousNameIndex',
            'threshold',
            'crossingMode'
        ]) Namg[p] = namg[p];
        for(let p of [
            'mainLists',
            'auxiliaryLists',
            'replacementLists'
        ]) Namg[p] = JSON.parse(JSON.stringify(namg[p]));
        return newDS;
    }

    save(){
        let d = {};
        d.secondary = this.secondary;
        d.displayName = this.displayName;
        let numg = d.numbering = {};
        let namg = d.naming = {};
        let Numg = this.numbering;
        let Namg = this.naming;
        for(let p of [
            'enabled',
            'prefix',
            'suffix',
            'threshold',
            'crossingMode'
        ]) numg[p] = Numg[p];
        for(let p of [
            'mainLists',
            'auxiliaryLists',
            'replacementLists',
            'annual',
            'annualAnchorYear',
            'continuousNameIndex',
            'threshold',
            'crossingMode'
        ]) namg[p] = Namg[p];
        return d;
    }

    load(data){
        if(data instanceof LoadData){
            let d = data.value;
            this.secondary = d.secondary;
            this.displayName = d.displayName;
            let Numg = this.numbering;
            let Namg = this.naming;
            let numg = d.numbering;
            let namg = d.naming;
            for(let p of [
                'enabled',
                'prefix',
                'suffix',
                'threshold'
            ]) Numg[p] = numg[p];
            Numg.crossingMode = numg.crossingMode || 0;
            for(let p of [
                'mainLists',
                'auxiliaryLists',
                'replacementLists',
                'annual',
                'annualAnchorYear',
                'continuousNameIndex',
                'threshold'
            ]) Namg[p] = namg[p];
            Namg.crossingMode = namg.crossingMode===undefined ? DESIG_CROSSMODE_STRICT_REGEN : namg.crossingMode;
            for(let i=Namg.auxiliaryLists.length-1;i>=0;i--){
                let a = Namg.auxiliaryLists[i];
                if(a.length===1 && a[0]==="Unnamed") Namg.auxiliaryLists.splice(i,1);
            }
            if(data.format<FORMAT_WITH_SCALES){ // convert thresholds from pre-v0.2 values
                Numg.threshold = Scale.convertOldValue(Numg.threshold);
                Namg.threshold = Scale.convertOldValue(Namg.threshold);
            }
        }
    }

    static convertFromOldNameList(list){
        let annual = list[0] instanceof Array;
        let main = [];
        let aux = [];
        if(annual){
            for(let i=0;i<list.length-1;i++) main.push(JSON.parse(JSON.stringify(list[i])));
            let auxlist = list[list.length-1];
            if(auxlist && auxlist[0]!=="Unnamed") aux.push(JSON.parse(JSON.stringify(auxlist)));
        }else main.push(JSON.parse(JSON.stringify(list)));
        return new DesignationSystem({
            mainLists: main,
            auxLists: aux,
            annual: annual
        });
    }
}

DesignationSystem.atlantic = new DesignationSystem({
    displayName: 'Atlantic',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bill','Claudette','Danny','Elsa','Fred','Grace','Henri','Ida','Julian','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Alex','Bonnie','Colin','Danielle','Earl','Fiona','Gaston','Hermine','Ian','Julia','Karl','Lisa','Martin','Nicole','Owen','Paula','Richard','Shary','Tobias','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Don','Emily','Franklin','Gert','Harold','Idalia','Jose','Katia','Lee','Margot','Nigel','Ophelia','Philippe','Rina','Sean','Tammy','Vince','Whitney'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Francine','Gordon','Helene','Isaac','Joyce','Kirk','Leslie','Milton','Nadine','Oscar','Patty','Rafael','Sara','Tony','Valerie','William'],
        ['Andrea','Barry','Chantal','Dorian','Erin','Fernand','Gabrielle','Humberto','Imelda','Jerry','Karen','Lorenzo','Melissa','Nestor','Olga','Pablo','Rebekah','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cristobal','Dolly','Edouard','Fay','Gonzalo','Hanna','Isaias','Josephine','Kyle','Laura','Marco','Nana','Omar','Paulette','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.easternPacific = new DesignationSystem({
    displayName: 'Eastern Pacific',
    suffix: 'E',
    annual: true,
    anchor: 1979,
    mainLists: [
        ["Andres","Blanca","Carlos","Dolores","Enrique","Felicia","Guillermo","Hilda","Ignacio","Jimena","Kevin","Linda","Marty","Nora","Olaf","Pamela","Rick","Sandra","Terry","Vivian","Waldo","Xina","York","Zelda"],
        ["Agatha","Blas","Celia","Darby","Estelle","Frank","Georgette","Howard","Ivette","Javier","Kay","Lester","Madeline","Newton","Orlene","Paine","Roslyn","Seymour","Tina","Virgil","Winifred","Xavier","Yolanda","Zeke"],
        ["Adrian","Beatriz","Calvin","Dora","Eugene","Fernanda","Greg","Hilary","Irwin","Jova","Kenneth","Lidia","Max","Norma","Otis","Pilar","Ramon","Selma","Todd","Veronica","Wiley","Xina","York","Zelda"],
        ["Aletta","Bud","Carlotta","Daniel","Emilia","Fabio","Gilma","Hector","Ileana","John","Kristy","Lane","Miriam","Norman","Olivia","Paul","Rosa","Sergio","Tara","Vicente","Willa","Xavier","Yolanda","Zeke"],
        ["Alvin","Barbara","Cosme","Dalila","Erick","Flossie","Gil","Henriette","Ivo","Juliette","Kiko","Lorena","Mario","Narda","Octave","Priscilla","Raymond","Sonia","Tico","Velma","Wallis","Xina","York","Zelda"],
        ["Amanda","Boris","Cristina","Douglas","Elida","Fausto","Genevieve","Hernan","Iselle","Julio","Karina","Lowell","Marie","Norbert","Odalys","Polo","Rachel","Simon","Trudy","Vance","Winnie","Xavier","Yolanda","Zeke"]
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.centralPacific = new DesignationSystem({
    displayName: 'Central Pacific',
    suffix: 'C',
    mainLists: [
        ["Akoni","Ema","Hone","Iona","Keli","Lala","Moke","Nolo","Olana","Pena","Ulana","Wale"],
        ["Aka","Ekeka","Hene","Iolana","Keoni","Lino","Mele","Nona","Oliwa","Pama","Upana","Wene"],
        ["Alika","Ele","Huko","Iopa","Kika","Lana","Maka","Neki","Omeka","Pewa","Unala","Wali"],
        ["Ana","Ela","Halola","Iune","Kilo","Loke","Malia","Niala","Oho","Pali","Ulika","Walaka"]
    ]
});

DesignationSystem.westernPacific = new DesignationSystem({
    displayName: 'Western Pacific',
    suffix: 'W',
    mainLists: [
        ["Damrey","Haikui","Kirogi","Yun-yeung","Koinu","Bolaven","Sanba","Jelawat","Ewiniar","Maliksi","Gaemi","Prapiroon","Maria","Son-Tinh","Ampil","Wukong","Jongdari","Shanshan","Yagi","Leepi","Bebinca","Rumbia","Soulik","Cimaron","Jebi","Mangkhut","Barijat","Trami"],
        ["Kong-rey","Yutu","Toraji","Man-yi","Usagi","Pabuk","Wutip","Sepat","Mun","Danas","Nari","Wipha","Francisco","Lekima","Krosa","Bailu","Podul","Lingling","Kajiki","Faxai","Peipah","Tapah","Mitag","Hagibis","Neoguri","Bualoi","Matmo","Halong"],
        ["Nakri","Fengshen","Kalmaegi","Fung-wong","Kammuri","Phanfone","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Mekkhala","Higos","Bavi","Maysak","Haishen","Noul","Dolphin","Kujira","Chan-hom","Linfa","Nangka","Saudel","Molave","Goni","Atsani","Etau","Vamco"],
        ["Krovanh","Dujuan","Surigae","Choi-wan","Koguma","Champi","In-fa","Cempaka","Nepartak","Lupit","Mirinae","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Lionrock","Kompasu","Namtheun","Malou","Nyatoh","Rai","Malakas","Megi","Chaba","Aere","Songda"],
        ["Trases","Mulan","Meari","Ma-on","Tokage","Hinnamnor","Muifa","Merbok","Nanmadol","Talas","Noru","Kulap","Roke","Sonca","Nesat","Haitang","Nalgae","Banyan","Yamaneko","Pakhar","Sanvu","Mawar","Guchol","Talim","Doksuri","Khanun","Lan","Saola"]
    ]
});

DesignationSystem.westernPacific1979 = new DesignationSystem({
    displayName: 'Western Pacific (1979-1989)',
    suffix: 'W',
    mainLists: [
        ["Andy","Bess","Cecil","Dot","Ellis","Faye","Gordon","Hope","Irving","Judy","Ken","Lola","Mac","Nancy","Owen","Pamela","Roger","Sarah","Tip","Vera","Wayne"],
        ["Abby","Ben","Carmen","Dom","Ellen","Forrest","Georgia","Herbert","Ida","Joe","Kim","Lex","Marge","Norris","Orchid","Percy","Ruth","Sperry","Thelma","Vernon","Wynne"],
        ["Alex","Betty","Cary","Dinah","Ed","Freda","Gerald","Holly","Ike","June","Kelly","Lynn","Maury","Nina","Ogden","Phyllis","Roy","Susan","Thad","Vanessa","Warren"],
        ["Agnes","Bill","Clara","Doyle","Elsie","Fabian","Gay","Hazen","Irma","Jeff","Kit","Lee","Mamie","Nelson","Odessa","Pat","Ruby","Skip","Tess","Val","Winona"]
     ]
});

DesignationSystem.westernPacific1989 = new DesignationSystem({
    displayName: 'Western Pacific (1989-1995)',
    suffix: 'W',
    mainLists: [
        ["Angela","Brian","Colleen","Dan","Elsie","Forrest","Gay","Hunt","Irma","Jack","Koryn","Lewis","Marian","Nathan","Ofelia","Percy","Robyn","Steve","Tasha","Vernon","Winona","Yancy","Zola"],
        ["Abe","Becky","Cecil","Dot","Ed","Flo","Gene","Hattie","Ira","Jeana","Kyle","Lola","Mike","Nell","Owen","Page","Russ","Sharon","Tim","Vanessa","Walt","Yunya","Zeke"],
        ["Amy","Brendan","Caitlin","Doug","Ellie","Fred","Gladys","Harry","Ivy","Joel","Kinna","Luke","Mireille","Nat","Orchid","Pat","Ruth","Seth","Thelma","Verne","Wilda","Yuri","Zelda"],
        ["Axel","Bobbie","Chuck","Deanna","Eli","Faye","Gary","Helen","Irving","Janis","Kent","Lois","Mark","Nina","Oscar","Polly","Ryan","Sibyl","Ted","Val","Ward","Yvette","Zack"]
     ]
});

DesignationSystem.westernPacific1996 = new DesignationSystem({
    displayName: 'Western Pacific (1996-1999)',
    suffix: 'W',
    mainLists: [
        ["Ann","Bart","Cam","Dan","Eve","Frankie","Gloria","Herb","Ian","Joy","Kirk","Lisa","Marty","Niki","Orson","Piper","Rick","Sally","Tom","Violet","Willie","Yates","Zane"],
        ["Abel","Beth","Carlo","Dale","Ernie","Fern","Greg","Hannah","Isa","Jimmy","Kelly","Levi","Marie","Nestor","Opal","Peter","Rosie","Scott","Tina","Victor","Winnie","Yule","Zita"],
        ["Amber","Bing","Cass","David","Ella","Fritz","Ginger","Hank","Ivan","Joan","Keith","Linda","Mort","Nichole","Otto","Penny","Rex","Stella","Todd","Vicki","Waldo","Yanni","Zeb"],
        ["Alex","Babs","Chip","Dawn","Elvis","Faith","Gil","Hilda","Iris","Jacob","Kate","Leo","Maggie","Neil","Olga","Paul","Rachel","Sam","Tanya","Virgil","Wendy","York","Zia"]
     ]
});

DesignationSystem.westernPacific2000 = new DesignationSystem({
    displayName: 'Western Pacific (2000-2005)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Longwang","Kirogi","Kai-tak","Tembin","Bolaven","Chanchu","Jelawat","Ewiniar","Bilis","Gaemi","Prapiroon","Maria","Saomai","Bopha","Wukong","Sonamu","Shanshan","Yagi","Xangsane","Bebinca","Rumbia","Soulik","Cimaron","Jebi","Durian","Utor","Trami"],
        ["Kong-rey","Yutu","Toraji","Man-yi","Usagi","Pabuk","Wutip","Sepat","Fitow","Danas","Nari","Wipha","Francisco","Lekima","Krosa","Haiyan","Podul","Lingling","Kajiki","Faxai","Vamei","Tapah","Mitag","Hagibis","Neoguri","Rammasun","Chataan","Halong"],
        ["Nakri","Fengshen","Kalmaegi","Fung-wong","Kammuri","Phanfone","Vongfong","Rusa","Sinlaku","Hagupit","Jangmi","Mekkhala","Higos","Bavi","Maysak","Haishen","Pongsona","Yanyan","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Imbudo","Goni","Morakot","Etau","Vamco"],
        ["Krovanh","Dujuan","Maemi","Choi-wan","Koppu","Ketsana","Parma","Melor","Nepartak","Lupit","Sudal","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Tingting","Kompasu","Namtheun","Malou","Meranti","Rananim","Malakas","Megi","Chaba","Aere","Songda"],
        ["Sarika","Haima","Meari","Ma-on","Tokage","Nock-ten","Muifa","Merbok","Nanmadol","Talas","Noru","Kulap","Roke","Sonca","Nesat","Haitang","Nalgae","Banyan","Washi","Matsa","Sanvu","Mawar","Guchol","Talim","Nabi","Khanun","Vicente","Saola"]
    ]
});

DesignationSystem.westernPacific2006 = new DesignationSystem({
    displayName: 'Western Pacific (2006-2011)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Haikui","Kirogi","Kai-tak","Tembin","Bolaven","Chanchu","Jelawat","Ewiniar","Bilis","Gaemi","Prapiroon","Maria","Saomai","Bopha","Wukong","Sonamu","Shanshan","Yagi","Xangsane","Bebinca","Rumbia","Soulik","Cimaron","Jebi","Durian","Utor","Trami"],
        ["Kong-rey","Yutu","Toraji","Man-yi","Usagi","Pabuk","Wutip","Sepat","Fitow","Danas","Nari","Wipha","Francisco","Lekima","Krosa","Haiyan","Podul","Lingling","Kajiki","Faxai","Peipah","Tapah","Mitag","Hagibis","Neoguri","Rammasun","Matmo","Halong"],
        ["Nakri","Fengshen","Kalmaegi","Fung-wong","Kammuri","Phanfone","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Mekkhala","Higos","Bavi","Maysak","Haishen","Noul","Dolphin","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Molave","Goni","Morakot","Etau","Vamco"],
        ["Krovanh","Dujuan","Mujigae","Choi-wan","Koppu","Ketsana","Parma","Melor","Nepartak","Lupit","Mirinae","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Lionrock","Kompasu","Namtheun","Malou","Meranti","Fanapi","Malakas","Megi","Chaba","Aere","Songda"],
        ["Sarika","Haima","Meari","Ma-on","Tokage","Nock-ten","Muifa","Merbok","Nanmadol","Talas","Noru","Kulap","Roke","Sonca","Nesat","Haitang","Nalgae","Banyan","Washi","Pakhar","Sanvu","Mawar","Guchol","Talim","Doksuri","Khanun","Vicente","Saola"]
    ]
});

DesignationSystem.westernPacific2012 = new DesignationSystem({
    displayName: 'Western Pacific (2012-2017)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Haikui","Kirogi","Kai-tak","Tembin","Bolaven","Sanba","Jelawat","Ewiniar","Maliksi","Gaemi","Prapiroon","Maria","Son-Tinh","Bopha","Wukong","Sonamu","Shanshan","Yagi","Leepi","Bebinca","Rumbia","Soulik","Cimaron","Jebi","Mangkhut","Utor","Trami"],
        ["Kong-rey","Yutu","Toraji","Man-yi","Usagi","Pabuk","Wutip","Sepat","Fitow","Danas","Nari","Wipha","Francisco","Lekima","Krosa","Haiyan","Podul","Lingling","Kajiki","Faxai","Peipah","Tapah","Mitag","Hagibis","Neoguri","Rammasun","Matmo","Halong"],
        ["Nakri","Fengshen","Kalmaegi","Fung-wong","Kammuri","Phanfone","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Mekkhala","Higos","Bavi","Maysak","Haishen","Noul","Dolphin","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Molave","Goni","Atsani","Etau","Vamco"],
        ["Krovanh","Dujuan","Mujigae","Choi-wan","Koppu","Champi","In-fa","Melor","Nepartak","Lupit","Mirinae","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Lionrock","Kompasu","Namtheun","Malou","Meranti","Rai","Malakas","Megi","Chaba","Aere","Songda"],
        ["Sarika","Haima","Meari","Ma-on","Tokage","Nock-ten","Muifa","Merbok","Nanmadol","Talas","Noru","Kulap","Roke","Sonca","Nesat","Haitang","Nalgae","Banyan","Hato","Pakhar","Sanvu","Mawar","Guchol","Talim","Doksuri","Khanun","Vicente","Saola"]
    ]
});

DesignationSystem.westernPacific2028 = new DesignationSystem({
    displayName: 'Western Pacific (2028)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Haikui","Kirogi","Yun-yeung","Koinu","Xebangfai","Sanba","Jelawat","Ewiniar","Maliksi","Gaemi","Prapiroon","Maria","Son-Tinh","Ampil","Wukong","Jongdari","Shanshan","Yagi","Leepi","Bebinca","Pulasan","Soulik","Cimaron","Baram","Krathon","Songyit","Trami"],
        ["Chantrea","Yutu","Toraji","Man-yi","Sora","Pabuk","Wutip","Sepat","Mun","Danas","Nari","Wipha","Jaiden","Somboon","Punthea","Kikanay","Podul","Lingling","Yuzuki","Sengphet","Peipah","Tapah","Matua","Michelle","Neoguri","Bualoi","Matmo","Halong"],
        ["Nakri","Shenwei","Kalmaegi","Fung-wong","Haruka","Kalani","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Sokha","Harrison","Bavi","Maysak","Kwan","Noul","Yanyan","Kujira","Chan-hom","Linfa","Nangka","Saudel","Molave","Goni","Atsani","Etau","Vamco"],
        ["Wattana","Dujuan","Surigae","Choi-wan","Koguma","Champi","In-fa","Sirena","Nepartak","Lupit","Mirinae","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Tingting","Kompasu","Namtheun","Jaewha","Nyatoh","Rai","Malakas","Megi","Chaba","Luna","Songda"],
        ["Trases","Mulan","Meari","Ma-on","Tokage","Hinnamnor","Muifa","Merbok","Nanmadol","Xiaoping","Noru","Kulap","Roke","Sonca","Nesat","Haitang","Nalgae","Tomiko","Yamaneko","Pakhar","Alamea","Mawar","Guchol","Talim","Doksuri","Khanun","Lan","Saola"]
    ]
});

DesignationSystem.westernPacificwmhb2005 = new DesignationSystem({
    displayName: 'Western Pacific WMHB (2005-2009)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Longwang","Akius","Kai-tak","Koinu","Bolaven","Chanchu","Jelawat","Ewiniar","Bilis","Gaemi","Prapiroon","Maria","Saomai","Bopha","Wukong","Sonamu","Shanshan","Haruka","Xangsane","Bebinca","Rumbia","Soulik","Cimaron","Jebi","Durian","Utor","Trami"],
        ["Kong-rey","Yutu","Toraji","Man-yi","Usagi","Pabuk","Wutip","Sepat","Fitow","Danas","Nari","Wipha","Francisco","Lekima","Krosa","Bailu","Podul","Lingling","Kajiki","Faxai","Vamei","Tapah","Mitag","Hagibis","Neoguri","Rammasun","Chataan","Halong"],
        ["Nakri","Fengshen","Kalmaegi","Fung-wong","Kammuri","Kalani","Vongfong","Rusa","Sinlaku","Hagupit","Jangmi","Mekkhala","Higos","Bavi","Liausak","Haishen","Pongsona","Dolphin","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Imbudo","Goni","Morakot","Etau","Vamco"],
        ["Krovanh","Dujuan","Maemi","Choi-wan","Koppu","Ketsana","Parma","Cempaka","Nepartak","Lupit","Sudal","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Tingting","Kompasu","Namtheun","Malou","Meranti","Rananim","Malakas","Megi","Chaba","Aere","Songda"],
        ["Sarika","Haima","Meari","Ma-on","Tokage","Nock-ten","Muifa","Merbok","Nanmadol","Talas","Noru","Kulap","Roke","Sonca","Anis","Haitang","Nalgae","Banyan","Washi","Matsa","Sanvu","Mawar","Guchol","Talim","Nabi","Khanun","Vicente","Saola"]
    ]
});

DesignationSystem.westernPacificwmhb2010 = new DesignationSystem({
    displayName: 'Western Pacific WMHB (2010-2014)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Longwang","Akius","Kai-tak","Koinu","Bolaven","Chanchu","Jelawat","Ewiniar","Bilis","Gaemi","Prapiroon","Maria","Saomai","Ampil","Wukong","Sonamu","Shanshan","Haruka","Xangsane","Maricel","Rumbia","Soulik","Cimaron","Jebi","Durian","Utor","Trami"],
        ["Kong-rey","Yutu","Toraji","Man-yi","Usagi","Pabuk","Wutip","Gyeong","Fitow","Danas","Nari","Wipha","Francisco","Somboon","Krosa","Bailu","Podul","Lingling","Kajiki","Faxai","Vamei","Tapah","Matua","Hagibis","Neoguri","Rammasun","Chataan","Halong"],
        ["Ketnien","Fengshen","Kalmaegi","Fung-wong","Kammuri","Kalani","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Sokha","Qiangsu","Bavi","Liausak","Haishen","Pongsona","Yanyan","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Imbudo","Goni","Morakot","Etau","Vamco"],
        ["Krovanh","Dujuan","Maemi","Choi-wan","Koppu","Ketsana","Parma","Cempaka","Nepartak","Lupit","Sudal","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Tingting","Kompasu","Namtheun","Jaewha","Meranti","Rananim","Malakas","Megi","Chaba","Aere","Songda"],
        ["Sarika","Haima","Meari","Ma-on","Tokage","Nock-ten","Muifa","Merbok","Nanmadol","Xiaoping","Noru","Kulap","Roke","Sonca","Anis","Haitang","Nalgae","Tomiko","Washi","Pakhar","Alamea","Mawar","Guchol","Talim","Nabi","Khanun","Vicente","Saola"]
    ]
});

DesignationSystem.westernPacificwmhb2015 = new DesignationSystem({
    displayName: 'Western Pacific WMHB (2015-2018)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Longwang","Akius","Kai-tak","Koinu","Bolaven","Chanchu","Jelawat","Ewiniar","Bilis","Gaemi","Prapiroon","Songyit","Saomai","Ampil","Jasni","Sonamu","Shanshan","Haruka","Xangsane","Maricel","Rumbia","Soulik","Cimaron","Jebi","Durian","Utor","Trami"],
        ["Kong-rey","Yutu","Toraji","Man-yi","Usagi","Pabuk","Wutip","Gyeong","Fitow","Danas","Nari","Wipha","Francisco","Somboon","Krosa","Kikanay","Podul","Lingling","Kajiki","Faxai","Vamei","Tapah","Matua","Hagibis","Isagani","Rammasun","Chataan","Halong"],
        ["Ketnien","Fengshen","Kalmaegi","Fung-wong","Kammuri","Kalani","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Sokha","Qiangsu","Bavi","Liausak","Kwan","Pongsona","Yanyan","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Imbudo","Goni","Morakot","Etau","Vamco"],
        ["Krovanh","Wattana","Maemi","Choi-wan","Koguma","Ketsana","Parma","Sirena","Nepartak","Lupit","Sudal","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Tingting","Kompasu","Namtheun","Jaewha","Nyatoh","Rananim","Malakas","Megi","Chaba","Aere","Songda"],
        ["Sarika","Haima","Meari","Ma-on","Tokage","Hinnamnor","Muifa","Merbok","Nanmadol","Xiaoping","Noru","Kulap","Roke","Sonca","Anis","Haitang","Nalgae","Tomiko","Washi","Makani","Alamea","Mawar","Guchol","Talim","Nabi","Khanun","Vicente","Saola"]
    ]
});

DesignationSystem.westernPacificwmhb2020 = new DesignationSystem({
    displayName: 'Western Pacific WMHB (2020)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Longwang","Akius","Kai-tak","Koinu","Bolaven","Chanchu","Jelawat","Ewiniar","Maliksi","Gaemi","Prapiroon","Songyit","Saomai","Ampil","Jasni","Sonamu","Shanshan","Yoshida","Xangsane","Maricel","Rumbia","Soulik","Cimaron","Baram","Durian","Utor","Trami"],
        ["Chantrea","Yutu","Toraji","Man-yi","Sora","Pabuk","Wutip","Gyeong","Fitow","Danas","Nari","Wipha","Francisco","Somboon","Punthea","Kikanay","Podul","Lingling","Yuzuki","Sengphet","Vamei","Tapah","Apwete","Michelle","Isagani","Rammasun","Chataan","Halong"],
        ["Ketnien","Shunwei","Kalmaegi","Fung-wong","Kammuri","Kalani","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Sokha","Qiangsu","Bavi","Liausak","Kwan","Pongsona","Yanyan","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Imbudo","Goni","Morakot","Etau","Vamco"],
        ["Krovanh","Wattana","Maemi","Choi-wan","Koguma","Ketsana","Parma","Sirena","Nepartak","Lupit","Sudal","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Tingting","Kompasu","Namtheun","Jaewha","Nyatoh","Rananim","Malakas","Megi","Chaba","Aere","Songda"],
        ["Sarika","Haima","Meari","Ma-on","Tokage","Hinnamnor","Muifa","Merbok","Nanmadol","Xiaoping","Noru","Kulap","Roke","Sonca","Anis","Haitang","Nalgae","Tomiko","Washi","Makani","Alamea","Mawar","Guchol","Talim","Nabi","Khanun","Vicente","Saola"]
    ]
});

DesignationSystem.westernPacificwmhb20202 = new DesignationSystem({
    displayName: 'Western Pacific WMHB (2020 with potential replacement names)',
    suffix: 'W',
    mainLists: [
        ["Damrey","Longwang","Akius","Kai-tak","Koinu","Akamu","Chanchu","Jelawat","Ewiniar","Maliksi","Gaemi","Minara","Songyit","Saomai","Ampil","Jasni","Jongdari","Shanshan","Uminoki","Xangsane","Maricel","Rumbia","Weno","Cimaron","Baram","Durian","Utor","Waejing"],
        ["Chantrea","Yutu","Toraji","Man-yi","Sora","Pabuk","Lotus","Gyeong","Mun","Danas","Baegjo","Wipha","Francisco","Somboon","Punthea","Kikanay","Podul","Lingling","Yuzuki","Sengphet","Vamei","Tapah","Apwete","Michelle","Isagani","Rammasun","Chataan","Halong"],
        ["Ketnien","Shunwei","Kalmaegi","Fung-wong","Kammuri","Kalani","Vongfong","Nuri","Sinlaku","Hagupit","Jangmi","Sokha","Qiangsu","Bavi","Liausak","Zhu-Tang","Pongsona","Yanyan","Kujira","Chan-hom","Linfa","Nangka","Soudelor","Molave","Keulein","Morakot","Etau","Vamco"],
        ["Ibis","Wattana","Maemi","Choi-wan","Koguma","Ketsana","Parma","Sirena","Nepartak","Gilagid","Sudal","Nida","Omais","Conson","Chanthu","Dianmu","Mindulle","Tingting","Kompasu","Namtheun","Jaewha","Nyatoh","Fanapi","Malakas","Megi","Chaba","Aere","Songda"],
        ["Trases","Mulan","Meari","Ma-on","Tokage","Hinnamnor","Muifa","Merbok","Nanmadol","Xiaoping","Noru","Aat","Roke","Sonca","Anis","Haitang","Nalgae","Yamaneko","Washi","Alika","Alamea","Farah","Guchol","Talim","Nabi","Khanun","Vicente","Saola"]
    ]
});


DesignationSystem.PAGASA = new DesignationSystem({
    displayName: 'PAGASA',
    secondary: true,
    numEnable: false,
    annual: true,
    anchor: 1963,
    nameThresh: 0,
    mainLists: [
        ["Amang","Betty","Chedeng","Dodong","Egay","Falcon","Goring","Hanna","Ineng","Jenny","Kabayan","Liwayway","Marilyn","Nimfa","Onyok","Perla","Quiel","Ramon","Sarah","Tamaraw","Ugong","Viring","Weng","Yoyoy","Zigzag","Abe","Berto","Charo","Dado","Estoy","Felion","Gening","Herman","Irma","Jaime"],
        ["Ambo","Butchoy","Carina","Dindo","Enteng","Ferdie","Gener","Helen","Igme","Julian","Kristine","Leon","Marce","Nika","Ofel","Pepito","Quinta","Rolly","Siony","Tonyo","Ulysses","Vicky","Warren","Yoyong","Zosimo","Alakdan","Baldo","Clara","Dencio","Estong","Felipe","Gomer","Heling","Ismael","Julio"],
        ["Auring","Bising","Crising","Dante","Emong","Fabian","Gorio","Huaning","Isang","Jolina","Kiko","Lannie","Maring","Nando","Odette","Paolo","Quedan","Ramil","Salome","Tino","Uwan","Verbena","Wilma","Yasmin","Zoraida","Alamid","Bruno","Conching","Dolor","Ernie","Florante","Gerardo","Hernan","Isko","Jerome"],
        ["Agaton","Basyang","Caloy","Domeng","Ester","Florita","Gardo","Henry","Inday","Josie","Karding","Luis","Maymay","Neneng","Obet","Paeng","Queenie","Rosal","Samuel","Tomas","Umberto","Venus","Waldo","Yayang","Zeny","Agila","Bagwis","Chito","Diego","Elena","Felino","Gunding","Harriet","Indang","Jessa"]
    ]
});

DesignationSystem.PAGASA1963 = new DesignationSystem({
    displayName: 'PAGASA (1963-2000)',
    secondary: true,
    numEnable: false,
    annual: true,
    anchor: 1963,
    nameThresh: 0,
    mainLists: [
        ["Auring","Bebeng","Karing","Diding","Etang","Gening","Herming","Ising","Luding","Mameng","Neneng","Oniang","Pepang","Rosing","Sisang","Trining","Uring","Welming","Yayang","Ading","Barang","Krising","Dadang","Erling","Goying"],
        ["Asiang","Biring","Konsing","Dading","Edeng","Gloring","Huaning","Isang","Lusing","Maring","Nitang","Osang","Paring","Reming","Seniang","Toyang","Undang","Welpring","Yoning","Aring","Basiang","Kayang","Dorang","Enang","Grasing"],
        ["Atring","Bining","Kuring","Daling","Elang","Goring","Huling","Ibiang","Luming","Miling","Narsing","Openg","Pining","Rubing","Saling","Tasing","Unding","Walding","Yeyeng","Anding","Binang","Kadiang","Dinang","Epang","Gundang"],
        ["Atang","Bising","Klaring","Deling","Emang","Gading","Heling","Iliang","Loleng","Miding","Norming","Oyang","Pitang","Ruping","Sening","Titang","Uding","Wening","Yoling","Aning","Bidang","Kading","Delang","Esang","Garding"]
     ]
});

DesignationSystem.PAGASA2001 = new DesignationSystem({
    displayName: 'PAGASA (2001-2004)',
    secondary: true,
    numEnable: false,
    annual: true,
    anchor: 1963,
    nameThresh: 0,
    mainLists: [
        ["Amang","Batibot","Chedeng","Dodong","Egay","Falcon","Gilas","Harurot","Ineng","Juaning","Kabayan","Lakay","Mina","Ni\u00f1a","Onyok","Pogi","Quiel","Roskas","Sikat","Tisoy","Ursula","Viring","Weng","Yoyoy","Zigzag","Abe","Berto","Charing","Danggit","Estoy","Fuago","Gening","Hantik","Irog","Jaime"],
        ["Ambo","Butchoy","Cosme","Dindo","Enteng","Frank","Gener","Helen","Igme","Julian","Karen","Lawin","Marce","Nina","Ofel","Pablo","Quinta","Rolly","Siony","Tonyo","Unding","Violeta","Winnie","Yoyong","Zosimo","Alakdan","Baldo","Clara","Dencio","Estong","Felipe","Gardo","Heling","Ismael","Julio"],
        ["Auring","Barok","Crising","Darna","Emong","Feria","Gorio","Huaning","Isang","Jolina","Kiko","Labuyo","Maring","Nanang","Ondoy","Pabling","Quedan","Roleta","Sibak","Talahib","Ubbeng","Vinta","Wilma","Yaning","Zuma","Alamid","Bruno","Conching","Dolor","Ernie","Florante","Gerardo","Hernan","Isko","Jerome"],
        ["Agaton","Basyang","Caloy","Dagul","Espada","Florita","Gardo","Hambalos","Inday","Juan","Kaka","Lagalag","Milenyo","Neneng","Ompong","Paloma","Quadro","Rapido","Sibasib","Tagbanwa","Usman","Venus","Wisik","Yayang","Zeny","Agila","Bagwis","Ciriaco","Diego","Elena","Forte","Gunding","Hunyango","Itoy","Jessa"]
     ]
});

DesignationSystem.PAGASA2005 = new DesignationSystem({
    displayName: 'PAGASA (2005-2008)',
    secondary: true,
    numEnable: false,
    annual: true,
    anchor: 1963,
    nameThresh: 0,
    mainLists: [
        ["Amang","Bebeng","Chedeng","Dodong","Egay","Falcon","Goring","Hanna","Ineng","Juaning","Kabayan","Lando","Mina","Nonoy","Onyok","Pedring","Quiel","Ramon","Sendong","Tisoy","Ursula","Viring","Weng","Yoyoy","Zigzag","Abe","Berto","Charo","Dado","Estoy","Felion","Gening","Herman","Irma","Jaime"],
        ["Ambo","Butchoy","Cosme","Dindo","Enteng","Frank","Gener","Helen","Igme","Julian","Karen","Lawin","Marce","Nina","Ofel","Pablo","Quinta","Rolly","Siony","Tonyo","Ulysses","Vicky","Warren","Yoyong","Zosimo","Alakdan","Baldo","Clara","Dencio","Estong","Felipe","Gardo","Heling","Ismael","Julio"],
        ["Auring","Bising","Crising","Dante","Emong","Feria","Gorio","Huaning","Isang","Jolina","Kiko","Labuyo","Maring","Nando","Ondoy","Pepeng","Quedan","Ramil","Santi","Tino","Urduja","Vinta","Wilma","Yolanda","Zoraida","Alamid","Bruno","Conching","Dolor","Ernie","Florante","Gerardo","Hernan","Isko","Jerome"],
        ["Agaton","Basyang","Caloy","Domeng","Ester","Florita","Glenda","Henry","Inday","Juan","Katring","Luis","Milenyo","Neneng","Ompong","Paeng","Queenie","Reming","Seniang","Tomas","Usman","Venus","Waldo","Yayang","Zeny","Agila","Bagwis","Chito","Diego","Elena","Felino","Gunding","Harriet","Indang","Jessa"]
     ]
});

DesignationSystem.australianRegionBoM = new DesignationSystem({
    displayName: 'Australian Region (BoM)',
    suffix: 'U',
    mainLists: [
        ["Anika","Billy","Charlotte","Dominic","Ellie","Freddy","Gabrielle","Herman","Ilsa","Jasper","Kirrily","Lincoln","Megan","Neville","Olga","Paul","Robyn","Sean","Tasha","Vince","Zelia"],
        ["Anthony","Bianca","Courtney","Dianne","Errol","Fina","Grant","Hayley","Iggy","Jenna","Koji","Luana","Mitchell","Narelle","Oran","Peta","Riordan","Sandra","Tim","Victoria","Zane"],
        ["Alessia","Bruce","Catherine","Dylan","Edna","Fletcher","Gillian","Hadi","Ivana","Jack","Kate","Laszlo","Mingzhu","Nathan","Olwyn","Quincey","Raquel","Stan","Tatiana","Uriah","Yvette"],
        ["Alfred","Blanche","Caleb","Dara","Ernie","Frances","Greg","Hilda","Irving","Joyce","Kelvin","Linda","Marco","Nora","Owen","Penny","Riley","Savannah","Trevor","Veronica","Wallace"],
        ["Ann","Blake","Claudia","Damien","Esther","Ferdinand","Gretel","Harold","Imogen","Joshua","Kimi","Lucas","Marian","Niran","Odette","Paddy","Ruby","Seth","Tiffany","Vernon"]
    ]
});

DesignationSystem.australianRegionJakarta = new DesignationSystem({
    displayName: 'Australian Region (Jakarta)',
    numEnable: false,
    mainLists: [
        ['Anggrek','Bakung','Cempaka','Dahlia','Flamboyan','Kenanga','Lili','Mangga','Seroja','Teratai']
    ],
    replacementLists: [
        ['Anggur','Belimbing','Duku','Jambu','Lengkeng','Melati','Nangka','Pisang','Rambutan','Sawo']
    ]
});

DesignationSystem.australianRegionPortMoresby = new DesignationSystem({
    displayName: 'Australian Region (Port Moresby)',
    numEnable: false,
    mainLists: [
        ['Alu','Buri','Dodo','Emau','Fere','Hibu','Ila','Kama','Lobu','Maila']
    ],
    replacementLists: [
        ['Nou','Obaha','Paia','Ranu','Sabi','Tau','Ume','Vali','Wau','Auram']
    ]
});

DesignationSystem.northIndianOcean = new DesignationSystem({
    displayName: 'North Indian Ocean',
    numEnable: false,
    mainLists: [
        ['Onil','Agni','Hibaru','Pyarr','Baaz','Fanoos','Mala','Mukda'],
        ['Ogni','Akash','Gonu','Yemyin','Sidr','Nargis','Rashmi','Khai-Muk'],
        ['Nisha','Bijli','Aila','Phyan','Ward','Laila','Bandu','Phet'],
        ['Giri','Jal','Keila','Thane','Murjan','Nilam','Viyaru','Phailin'],
        ['Helen','Lehar','Madi','Nanauk','Hudhud','Nilofar','Ashobaa','Komen'],
        ['Chapala','Megh','Roanu','Kyant','Nada','Vardah','Maarutha','Mora'],
        ['Ockhi','Sagar','Mekunu','Daye','Luban','Titli','Gaja','Phethai'],
        ['Fani','Vayu','Hikaa','Kyarr','Maha','Bulbul','Pawan','Amphan']
    ]
});

DesignationSystem.southWestIndianOcean = new DesignationSystem({
    displayName: 'Southwest Indian Ocean',
    suffix: 'R',
    annual: true,
    anchor: 2017,
    mainLists: [
        ['Ambali','Belna','Calvinia','Diane','Esami','Francisco','Gabekile','Herold','Irondro','Jeruto','Kundai','Lisebo','Michel','Nousra','Olivier','Pokera','Quincy','Rebaone','Salama','Tristan','Ursula','Violet','Wilson','Xila','Yekela','Zania'],
        ['Ava','Bongoyo','Chalane','Danilo','Eloise','Faraji','Guambe','Habana','Iman','Jobo','Kanga','Ludzi','Melina','Nathan','Onias','Pelagie','Quamar','Rita','Solani','Tarik','Urilia','Vuyane','Wagner','Xusa','Yarona','Zacarias'],
        ['Ana','Batsirai','Cliff','Damako','Emnati','Fezile','Gombe','Halima','Issa','Jasmine','Karim','Letlama','Maipelo','Njazi','Oscar','Pamela','Quentin','Rajab','Savana','Themba','Uyapo','Viviane','Walter','Xangy','Yemurai','Zanele']
    ]
});

DesignationSystem.southPacific = new DesignationSystem({
    displayName: 'South Pacific',
    suffix: 'F',
    mainLists: [
        ['Ana','Bina','Cody','Dovi','Eva','Fili','Gina','Hale','Irene','Judy','Kevin','Lola','Mal','Nat','Osai','Pita','Rae','Seru','Tam','Urmil','Vaianu','Wati','Xavier','Yani','Zita'],
        ['Arthur','Becky','Chip','Denia','Elisa','Fotu','Glen','Hettie','Innis','Julie','Ken','Lin','Maciu','Nisha','Orea','Pearl','Rene','Sarah','Troy','Uinita','Vanessa','Wano','Yvonne','Zaka'],
        ['Alvin','Bune','Cyril','Daphne','Eden','Florin','Garry','Haley','Isa','June','Kofi','Louise','Mike','Niko','Opeti','Perry','Reuben','Solo','Tuni','Ulu','Victor','Wanita','Yates','Zidane'],
        ['Amos','Bart','Crystal','Dean','Ella','Fehi','Garth','Hola','Iris','Josie','Keni','Liua','Mona','Neil','Oma','Pola','Rita','Sarai','Tino','Uesi','Vicky','Wasi','Yolanda','Zazu']
    ],
    replacementLists: [
        ['Aru','Ben','Chris','Danial','Emosi','Feki','Germaine','Hart','Ili','Josese','Kirio','Lute','Mata','Neta','Olivia','Pana','Rex','Samadiyo','Tasi','Uila','Velma','Wane','Yasa','Zanna']
    ]
});

DesignationSystem.southAtlantic = new DesignationSystem({
    displayName: 'South Atlantic',
    suffix: 'Q',
    mainLists: [
        ['Arani','Bapo','Cari','Deni','E\u00e7a\u00ed','Guar\u00e1','Iba','Jaguar','Kurum\u00ed','Mani','Oquira','Potira','Raoni','Ub\u00e1','Yakecan']
    ]
});

DesignationSystem.atlantic1979 = new DesignationSystem({
    displayName: 'Atlantic (1979-1984)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bob','Claudette','David','Elena','Frederic','Gloria','Henri','Isabel','Juan','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Allen','Bonnie','Charley','Danielle','Earl','Frances','Georges','Hermine','Ivan','Jeanne','Karl','Lisa','Mitch','Nicole','Otto','Paula','Richard','Shary','Tomas','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Dennis','Emily','Floyd','Gert','Harvey','Irene','Jose','Katrina','Lenny','Maria','Nate','Ophelia','Philippe','Rita','Stan','Tammy','Vince','Wilma'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gilbert','Helene','Isaac','Joan','Keith','Leslie','Michael','Nadine','Oscar','Patty','Rafael','Sandy','Tony','Valerie','William'],
        ['Alicia','Barry','Chantal','Dean','Erin','Felix','Gabrielle','Hugo','Iris','Jerry','Karen','Luis','Marilyn','Noel','Opal','Pablo','Roxanne','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cesar','Diana','Edouard','Fran','Gustav','Hortense','Isidore','Josephine','Klaus','Lili','Marco','Nana','Omar','Paloma','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlantic1985 = new DesignationSystem({
    displayName: 'Atlantic (1985-1990)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bob','Claudette','Danny','Elena','Fabian','Gloria','Henri','Isabel','Juan','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Andrew','Bonnie','Charley','Danielle','Earl','Frances','Georges','Hermine','Ivan','Jeanne','Karl','Lisa','Mitch','Nicole','Otto','Paula','Richard','Shary','Tomas','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Dennis','Emily','Floyd','Gert','Harvey','Irene','Jose','Katrina','Lenny','Maria','Nate','Ophelia','Philippe','Rita','Stan','Tammy','Vince','Wilma'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gilbert','Helene','Isaac','Joan','Keith','Leslie','Michael','Nadine','Oscar','Patty','Rafael','Sandy','Tony','Valerie','William'],
        ['Allison','Barry','Chantal','Dean','Erin','Felix','Gabrielle','Hugo','Iris','Jerry','Karen','Luis','Marilyn','Noel','Opal','Pablo','Roxanne','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cesar','Diana','Edouard','Fran','Gustav','Hortense','Isidore','Josephine','Klaus','Lili','Marco','Nana','Omar','Paloma','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlantic1991 = new DesignationSystem({
    displayName: 'Atlantic (1991-1996)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bob','Claudette','Danny','Erika','Fabian','Grace','Henri','Isabel','Juan','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Andrew','Bonnie','Charley','Danielle','Earl','Frances','Georges','Hermine','Ivan','Jeanne','Karl','Lisa','Mitch','Nicole','Otto','Paula','Richard','Shary','Tomas','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Dennis','Emily','Floyd','Gert','Harvey','Irene','Jose','Katrina','Lenny','Maria','Nate','Ophelia','Philippe','Rita','Stan','Tammy','Vince','Wilma'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gordon','Helene','Isaac','Joyce','Keith','Leslie','Michael','Nadine','Oscar','Patty','Rafael','Sandy','Tony','Valerie','William'],
        ['Allison','Barry','Chantal','Dean','Erin','Felix','Gabrielle','Humberto','Iris','Jerry','Karen','Luis','Marilyn','Noel','Opal','Pablo','Roxanne','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cesar','Dolly','Edouard','Fran','Gustav','Hortense','Isidore','Josephine','Kyle','Lili','Marco','Nana','Omar','Paloma','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlantic1997 = new DesignationSystem({
    displayName: 'Atlantic (1997-2002)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bill','Claudette','Danny','Erika','Fabian','Grace','Henri','Isabel','Juan','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Alex','Bonnie','Charley','Danielle','Earl','Frances','Georges','Hermine','Ivan','Jeanne','Karl','Lisa','Mitch','Nicole','Otto','Paula','Richard','Shary','Tomas','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Dennis','Emily','Floyd','Gert','Harvey','Irene','Jose','Katrina','Lenny','Maria','Nate','Ophelia','Philippe','Rita','Stan','Tammy','Vince','Wilma'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gordon','Helene','Isaac','Joyce','Keith','Leslie','Michael','Nadine','Oscar','Patty','Rafael','Sandy','Tony','Valerie','William'],
        ['Allison','Barry','Chantal','Dean','Erin','Felix','Gabrielle','Humberto','Iris','Jerry','Karen','Lorenzo','Michelle','Noel','Olga','Pablo','Rebekah','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cristobal','Dolly','Edouard','Fay','Gustav','Hanna','Isidore','Josephine','Kyle','Lili','Marco','Nana','Omar','Paloma','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlantic2003 = new DesignationSystem({
    displayName: 'Atlantic (2003-2008)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bill','Claudette','Danny','Erika','Fabian','Grace','Henri','Isabel','Juan','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Alex','Bonnie','Charley','Danielle','Earl','Frances','Gaston','Hermine','Ivan','Jeanne','Karl','Lisa','Matthew','Nicole','Otto','Paula','Richard','Shary','Tomas','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Dennis','Emily','Franklin','Gert','Harvey','Irene','Jose','Katrina','Lee','Maria','Nate','Ophelia','Philippe','Rita','Stan','Tammy','Vince','Wilma'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gordon','Helene','Isaac','Joyce','Kirk','Leslie','Michael','Nadine','Oscar','Patty','Rafael','Sandy','Tony','Valerie','William'],
        ['Andrea','Barry','Chantal','Dean','Erin','Felix','Gabrielle','Humberto','Ingrid','Jerry','Karen','Lorenzo','Melissa','Noel','Olga','Pablo','Rebekah','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cristobal','Dolly','Edouard','Fay','Gustav','Hanna','Ike','Josephine','Kyle','Laura','Marco','Nana','Omar','Paloma','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlantic2009 = new DesignationSystem({
    displayName: 'Atlantic (2009-2014)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bill','Claudette','Danny','Erika','Fred','Grace','Henri','Ida','Joaquin','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Alex','Bonnie','Colin','Danielle','Earl','Fiona','Gaston','Hermine','Igor','Julia','Karl','Lisa','Matthew','Nicole','Otto','Paula','Richard','Shary','Tomas','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Don','Emily','Franklin','Gert','Harvey','Irene','Jose','Katia','Lee','Maria','Nate','Ophelia','Philippe','Rina','Sean','Tammy','Vince','Whitney'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gordon','Helene','Isaac','Joyce','Kirk','Leslie','Michael','Nadine','Oscar','Patty','Rafael','Sandy','Tony','Valerie','William'],
        ['Andrea','Barry','Chantal','Dorian','Erin','Fernand','Gabrielle','Humberto','Ingrid','Jerry','Karen','Lorenzo','Melissa','Nestor','Olga','Pablo','Rebekah','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cristobal','Dolly','Edouard','Fay','Gonzalo','Hanna','Isaias','Josephine','Kyle','Laura','Marco','Nana','Omar','Paulette','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlantic2015 = new DesignationSystem({
    displayName: 'Atlantic (2015-2018)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bill','Claudette','Danny','Erika','Fred','Grace','Henri','Ida','Joaquin','Kate','Larry','Mindy','Nicholas','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Alex','Bonnie','Colin','Danielle','Earl','Fiona','Gaston','Hermine','Ian','Julia','Karl','Lisa','Matthew','Nicole','Otto','Paula','Richard','Shary','Tobias','Virginie','Walter'],
        ['Arlene','Bret','Cindy','Don','Emily','Franklin','Gert','Harvey','Irma','Jose','Katia','Lee','Maria','Nate','Ophelia','Philippe','Rina','Sean','Tammy','Vince','Whitney'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gordon','Helene','Isaac','Joyce','Kirk','Leslie','Michael','Nadine','Oscar','Patty','Rafael','Sara','Tony','Valerie','William'],
        ['Andrea','Barry','Chantal','Dorian','Erin','Fernand','Gabrielle','Humberto','Imelda','Jerry','Karen','Lorenzo','Melissa','Nestor','Olga','Pablo','Rebekah','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cristobal','Dolly','Edouard','Fay','Gonzalo','Hanna','Isaias','Josephine','Kyle','Laura','Marco','Nana','Omar','Paulette','Rene','Sally','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlantic2027 = new DesignationSystem({
    displayName: 'Atlantic (2027-2033)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Ana','Bill','Cosmo','Danny','Emma','Fred','Grace','Harrison','Ida','Julian','Ketsane','Larry','Marinette','Neville','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Alex','Bonnie','Colin','Danielle','Earl','Florelle','Grayson','Hermine','Irving','Jennifer','Karl','Lisa','Matt','Nicole','Owen','Paula','Richard','Shary','Tobias','Virginie','Walter'],
        ['Alya','Bret','Cindy','Don','Emily','Franklin','Gert','Harold','Irgot','James','Katasha','Lincoln','Mallory','Nelson','Ophelia','Philippe','Rina','Seth','Tammy','Vince','Whitney'],
        ['Alberto','Beryl','Chris','Darcy','Ernesto','Francine','Gerald','Helene','Isaac','Jaiden','Kenny','Lori','Mason','Nadja','Oscar','Patty','Rafael','Sara','Tony','Valerie','William'],
        ['Andrea','Barry','Chantal','Drew','Erin','Fernand','Greta','Henry','Isha','Jerry','Karen','Lawin','Melissa','Nestor','Olga','Pablo','Rebekah','Sebastien','Tanya','Van','Wendy'],
        ['Arthur','Bertha','Cristobal','Dolly','Edouard','Fay','Gabriel','Hanna','Ibrahim','Joanna','Kyle','Luan','Marco','Nathalie','Omar','Paulette','Roger','Stella','Teddy','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.atlanticbruhmhb = new DesignationSystem({
    displayName: 'Atlantic (bruhs wmhb)',
    suffix: 'L',
    annual: true,
    anchor: 1979,
    mainLists: [
        ['Alya','Bob','Chloe','David','Elena','Frederic','Glenda','Harrison','Isabel','Juan','Kate','Larry','Marinette','Nathaniel','Odette','Peter','Rose','Sam','Teresa','Victor','Wanda'],
        ['Andrew','Belle','Charley','Davis','Earl','Frances','Gaston','Heather','Ivan','Jeanne','Kent','Lisa','Mitch','Nicole','Otto','Pearl','Richard','Shary','Tomas','Virginie','Walter'],
        ['Arlene','Bret','Colette','Dennis','Ella','Floyd','Genesis','Harvey','Irene','James','Katrina','Lincoln','Maria','Nate','Oriana','Percy','Rita','Stan','Tammy','Vince','Wilma'],
        ['Alberto','Beryl','Chris','Debby','Ernesto','Florence','Gilbert','Harmony','Isaac','Joan','Keith','Lori','Michael','Nadja','Odin','Pheobe','Rafael','Sandy','Tony','Valerie','William'],
        ['Allison','Barry','Chantal','Dean','Erin','Felix','Gracelyn','Hugo','Iris','Jollie','Kathy','Luis','Marilyn','Nestor','Opal','Pat','Roxanne','Seth','Tanya','Vincent','Wendy'],
        ['Arthur','Bertha','Cesar','Diana','Edd','Fran','Gustav','Hortense','Isidore','Jaiden','Kyle','Luna','Matt','Nancy','Oliver','Paloma','Ryan','Stella','Tord','Vicky','Wilfred']
    ],
    auxLists: [
        ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega'],
        ['Alef','Bet','Gimel','Dalet','He','Vav','Zayin','Het','Tet','Yod','Kaf','Lamed','Mem','Nun','Samekh','Ayin','Pe','Tsadi','Qof','Resh','Shin','Tav'] // Hebrew Alphabet not actually official, but added due to popular demand
    ]
});

DesignationSystem.periodicTable = new DesignationSystem({
    displayName: 'Periodic Table',
    suffix: DEPRESSION_LETTER,
    mainLists: [
        ["Hydrogen","Helium","Lithium","Beryllium","Boron","Carbon","Nitrogen","Oxygen","Fluorine","Neon","Sodium","Magnesium","Aluminium","Silicon","Phosphorus","Sulfur","Chlorine","Argon","Potassium","Calcium","Scandium","Titanium","Vanadium","Chromium","Manganese","Iron","Cobalt","Nickel","Copper","Zinc","Gallium","Germanium","Arsenic","Selenium","Bromine","Krypton","Rubidium","Strontium","Yttrium","Zirconium","Niobium","Molybdenum","Technetium","Ruthenium","Rhodium","Palladium","Silver","Cadmium","Indium","Tin","Antimony","Tellurium","Iodine","Xenon","Caesium","Barium","Lanthanum","Cerium","Praseodymium","Neodymium","Promethium","Samarium","Europium","Gadolinium","Terbium","Dysprosium","Holmium","Erbium","Thulium","Ytterbium","Lutetium","Hafnium","Tantalum","Tungsten","Rhenium","Osmium","Iridium","Platinum","Gold","Mercury","Thallium","Lead","Bismuth","Polonium","Astatine","Radon","Francium","Radium","Actinium","Thorium","Protactinium","Uranium","Neptunium","Plutonium","Americium","Curium","Berkelium","Californium","Einsteinium","Fermium","Mendelevium","Nobelium","Lawrencium","Rutherfordium","Dubnium","Seaborgium","Bohrium","Hassium","Meitnerium","Darmstadtium","Roentgenium","Copernicium","Nihonium","Flerovium","Moscovium","Livermorium","Tennessine","Oganesson"]
    ]
});

DesignationSystem.periodicTableAnnual = DesignationSystem.periodicTable.clone();
DesignationSystem.periodicTableAnnual.naming.annual = true;
DesignationSystem.periodicTableAnnual.displayName = 'Periodic Table (Annual)';

DesignationSystem.presetDesignationSystems = [
    DesignationSystem.atlantic,
    DesignationSystem.easternPacific,
    DesignationSystem.centralPacific,
    DesignationSystem.westernPacific,
    DesignationSystem.westernPacific1979,
    DesignationSystem.westernPacific1989,
    DesignationSystem.westernPacific1996,
    DesignationSystem.westernPacific2000,
    DesignationSystem.westernPacific2006,
    DesignationSystem.westernPacific2012,
    DesignationSystem.westernPacific2028,
    DesignationSystem.westernPacificwmhb2005,
    DesignationSystem.westernPacificwmhb2010,
    DesignationSystem.westernPacificwmhb2015,
    DesignationSystem.westernPacificwmhb2020,
    DesignationSystem.westernPacificwmhb20202,
    DesignationSystem.PAGASA,
    DesignationSystem.PAGASA1963,
    DesignationSystem.PAGASA2001,
    DesignationSystem.PAGASA2005,
    DesignationSystem.northIndianOcean,
    DesignationSystem.australianRegionBoM,
    DesignationSystem.southPacific,
    DesignationSystem.southWestIndianOcean,
    DesignationSystem.southAtlantic,
    DesignationSystem.australianRegionJakarta,
    DesignationSystem.australianRegionPortMoresby,
    DesignationSystem.atlantic1979,
    DesignationSystem.atlantic1985,
    DesignationSystem.atlantic1991,
    DesignationSystem.atlantic1997,
    DesignationSystem.atlantic2003,
    DesignationSystem.atlantic2009,
    DesignationSystem.atlantic2015,
    DesignationSystem.atlantic2027,
    DesignationSystem.atlanticbruhmhb,
    DesignationSystem.periodicTable,
    DesignationSystem.periodicTableAnnual
];
