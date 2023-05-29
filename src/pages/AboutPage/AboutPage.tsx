import { FunctionComponent, useEffect, useState } from "react";
import Markdown from "../../Markdown/Markdown";

const aboutMd = ''

type Props = {
    // none
}

const AboutPage: FunctionComponent<Props> = () => {
    const [source, setSource] = useState<string>('')
    useEffect(() => {
        fetch('/markdown/about.md').then((response) => {
            if (response.ok) {
              response.text().then((txt) => {
                setSource(txt)
              })
            }
        })
    }, [])
    return (
        <div style={{padding: 20}}>
            <Markdown source={source} />
        </div>
    )
}

export default AboutPage